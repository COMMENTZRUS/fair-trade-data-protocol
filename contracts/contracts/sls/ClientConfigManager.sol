// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";
import "../interfaces/IClientConfigManager.sol";

/// @title ClientConfigManager
/// @notice FTDP / SLS deployment key & bitmask role registry with EIP-712 meta-transactions.
contract ClientConfigManager is Ownable, EIP712, Nonces, IClientConfigManager {
    uint256 public constant override ROLE_ADMIN = 1 << 0;
    uint256 public constant override ROLE_GRANT = 1 << 1;
    uint256 public constant override ROLE_READ = 1 << 2;
    uint256 public constant override ROLE_WRITE = 1 << 3;
    uint256 public constant override ROLE_SUPERUSER = 1 << 4;

    bytes32 public constant SET_KEY_TYPEHASH = keccak256(
        "SetKey(bytes32 deploymentId,address key,uint256 roles,uint256 expires,uint256 nonce,uint256 deadline)"
    );

    struct KeyConfig {
        bytes32 deploymentId;
        uint256 roles;
        uint256 expires;
    }

    mapping(bytes32 => bool) public override deploymentExists;
    mapping(address => KeyConfig) public keyConfigs;

    event DeploymentRegistered(bytes32 indexed deploymentId, address indexed adminKey, uint256 expires);
    event KeyUpdated(bytes32 indexed deploymentId, address indexed key, uint256 roles, uint256 expires);

    error DeploymentAlreadyExists(bytes32 deploymentId);
    error DeploymentNotFound(bytes32 deploymentId);
    error Unauthorized();
    error InvalidAddress();
    error InvalidDeploymentId();
    error SignatureExpired();
    error InvalidSignature();

    constructor(address initialOwner) Ownable(initialOwner) EIP712("FTDPClientConfig", "1") {}

    /// @notice Register a new app/org Deployment (e.g. Panorama, Top News, or a Data Union) with its initial admin key.
    function registerDeployment(
        bytes32 deploymentId,
        address adminKey,
        uint256 expires
    ) external {
        if (deploymentId == bytes32(0)) revert InvalidDeploymentId();
        if (adminKey == address(0)) revert InvalidAddress();
        if (deploymentExists[deploymentId]) revert DeploymentAlreadyExists(deploymentId);

        deploymentExists[deploymentId] = true;
        uint256 initialRoles = ROLE_ADMIN | ROLE_GRANT | ROLE_READ | ROLE_WRITE;
        keyConfigs[adminKey] = KeyConfig({
            deploymentId: deploymentId,
            roles: initialRoles,
            expires: expires
        });

        emit DeploymentRegistered(deploymentId, adminKey, expires);
        emit KeyUpdated(deploymentId, adminKey, initialRoles, expires);
    }

    /// @notice Assign or revoke bitmask roles for `key` within `deploymentId`.
    function setKey(
        bytes32 deploymentId,
        address key,
        uint256 roles,
        uint256 expires
    ) external {
        if (!deploymentExists[deploymentId]) revert DeploymentNotFound(deploymentId);
        if (key == address(0)) revert InvalidAddress();
        if (!_canAdminDeployment(deploymentId, msg.sender)) revert Unauthorized();

        _setKey(deploymentId, key, roles, expires);
    }

    /// @notice Gasless EIP-712 key role update signed by a deployment admin.
    function setKeyMeta(
        bytes32 deploymentId,
        address signer,
        address key,
        uint256 roles,
        uint256 expires,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (!deploymentExists[deploymentId]) revert DeploymentNotFound(deploymentId);
        if (key == address(0)) revert InvalidAddress();
        if (block.timestamp >= deadline) revert SignatureExpired();
        if (!_canAdminDeployment(deploymentId, signer)) revert Unauthorized();

        uint256 nonce = _useNonce(signer);
        bytes32 structHash = keccak256(
            abi.encode(SET_KEY_TYPEHASH, deploymentId, key, roles, expires, nonce, deadline)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) != signer) {
            revert InvalidSignature();
        }

        _setKey(deploymentId, key, roles, expires);
    }

    function _setKey(bytes32 deploymentId, address key, uint256 roles, uint256 expires) internal {
        keyConfigs[key] = KeyConfig({
            deploymentId: deploymentId,
            roles: roles,
            expires: expires
        });
        emit KeyUpdated(deploymentId, key, roles, expires);
    }

    function _canAdminDeployment(bytes32 deploymentId, address actor) internal view returns (bool) {
        return actor == owner() || hasRole(deploymentId, actor, ROLE_ADMIN);
    }

    function getDeploymentId(address key) public view override returns (bytes32) {
        return keyConfigs[key].deploymentId;
    }

    function keyToId(address key) external view override returns (bytes32) {
        return keyConfigs[key].deploymentId;
    }

    function hasRole(bytes32 deploymentId, address key, uint256 role) public view override returns (bool) {
        KeyConfig storage cfg = keyConfigs[key];
        if (cfg.deploymentId != deploymentId) return false;
        if (cfg.expires != 0 && block.timestamp >= cfg.expires) return false;
        if ((cfg.roles & ROLE_SUPERUSER) != 0) return true;
        return (cfg.roles & role) == role;
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
