// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../interfaces/IClientConfigManager.sol";
import "../interfaces/IAccessPermissions.sol";

/// @title AccessPermissions
/// @notice FTDP / SLS on-chain permission registry and opt-in Merkle consent verifier.
contract AccessPermissions is Ownable, IAccessPermissions {
    IClientConfigManager public immutable clientConfig;

    // Authorized market contracts that can issue grants upon completed purchase
    mapping(address => bool) public authorizedMarkets;

    // grantorDeploymentId => latest committed user opt-in consent Merkle root
    mapping(bytes32 => bytes32) public optInMerkleRoots;

    // grantorDeploymentId => granteeDeploymentId => dataId => PermissionGrant
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => PermissionGrant))) private _grants;

    event MarketAuthorized(address indexed market, bool authorized);
    event OptInMerkleRootUpdated(bytes32 indexed deploymentId, bytes32 indexed merkleRoot);
    event AccessSet(
        bytes32 indexed grantorDeploymentId,
        bytes32 indexed granteeDeploymentId,
        bytes32 indexed dataId,
        uint256 requiredFlags,
        uint256 readRoles,
        uint256 expires
    );

    error Unauthorized();
    error InvalidAddress();

    constructor(address clientConfig_, address initialOwner) Ownable(initialOwner) {
        if (clientConfig_ == address(0)) revert InvalidAddress();
        clientConfig = IClientConfigManager(clientConfig_);
    }

    function setAuthorizedMarket(address market, bool authorized) external onlyOwner {
        if (market == address(0)) revert InvalidAddress();
        authorizedMarkets[market] = authorized;
        emit MarketAuthorized(market, authorized);
    }

    /// @notice Commit the latest Merkle root of `(uidHash, optInFlagsBitmask)` leaves for a Deployment.
    function setOptInMerkleRoot(bytes32 deploymentId, bytes32 merkleRoot) external {
        bool isAdmin = clientConfig.hasRole(deploymentId, msg.sender, clientConfig.ROLE_ADMIN());
        bool isWriter = clientConfig.hasRole(deploymentId, msg.sender, clientConfig.ROLE_WRITE());
        if (!isAdmin && !isWriter && msg.sender != owner()) revert Unauthorized();

        optInMerkleRoots[deploymentId] = merkleRoot;
        emit OptInMerkleRootUpdated(deploymentId, merkleRoot);
    }

    /// @notice Direct permission grant by a deployment's ROLE_GRANT or ROLE_ADMIN key.
    function setPermissions(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId,
        uint256 requiredFlags,
        uint256 readRoles,
        uint256 expires
    ) external {
        bool isAdmin = clientConfig.hasRole(grantorDeploymentId, msg.sender, clientConfig.ROLE_ADMIN());
        bool isGrantor = clientConfig.hasRole(grantorDeploymentId, msg.sender, clientConfig.ROLE_GRANT());
        if (!isAdmin && !isGrantor) revert Unauthorized();

        _setPermissions(grantorDeploymentId, granteeDeploymentId, dataId, requiredFlags, readRoles, expires);
    }

    /// @notice Admin / authorized Market permission grant (invoked during Market.purchase).
    function setPermissionsAdmin(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId,
        uint256 requiredFlags,
        uint256 readRoles,
        uint256 expires
    ) external override {
        if (!authorizedMarkets[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _setPermissions(grantorDeploymentId, granteeDeploymentId, dataId, requiredFlags, readRoles, expires);
    }

    function _setPermissions(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId,
        uint256 requiredFlags,
        uint256 readRoles,
        uint256 expires
    ) internal {
        _grants[grantorDeploymentId][granteeDeploymentId][dataId] = PermissionGrant({
            requiredFlags: requiredFlags,
            readRoles: readRoles,
            expires: expires
        });
        emit AccessSet(grantorDeploymentId, granteeDeploymentId, dataId, requiredFlags, readRoles, expires);
    }

    function getPermissions(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId
    ) external view override returns (PermissionGrant memory) {
        return _grants[grantorDeploymentId][granteeDeploymentId][dataId];
    }

    /// @notice Verifies whether `grantee` may read `uid`'s `dataId` record from `grantorDeploymentId`,
    ///         enforcing key role, non-expired grant, required consent flags, and Merkle opt-in proof.
    function canRead(
        address grantee,
        bytes32 grantorDeploymentId,
        bytes32 uid,
        bytes32 dataId,
        uint256 merkleFlags,
        bytes32[] calldata merkleProof
    ) external view override returns (bool) {
        bytes32 granteeDeploymentId = clientConfig.getDeploymentId(grantee);
        if (granteeDeploymentId == bytes32(0)) return false;

        PermissionGrant memory grant = _grants[grantorDeploymentId][granteeDeploymentId][dataId];
        // Fall back to wildcard dataset grant (dataId == bytes32(0))
        if (grant.expires == 0 && dataId != bytes32(0)) {
            grant = _grants[grantorDeploymentId][granteeDeploymentId][bytes32(0)];
        }
        if (grant.expires == 0 || block.timestamp >= grant.expires) return false;

        uint256 neededRoles = grant.readRoles == 0 ? clientConfig.ROLE_READ() : grant.readRoles;
        if (!clientConfig.hasRole(granteeDeploymentId, grantee, neededRoles)) return false;

        // Verify user's opt-in bitmask satisfies all flags required by the grant
        if ((merkleFlags & grant.requiredFlags) != grant.requiredFlags) return false;

        // Verify Merkle proof against the grantor's committed opt-in root
        bytes32 root = optInMerkleRoots[grantorDeploymentId];
        if (grant.requiredFlags != 0 || root != bytes32(0)) {
            if (root == bytes32(0)) return false;
            bytes32 leaf = keccak256(abi.encodePacked(uid, merkleFlags));
            if (!MerkleProof.verify(merkleProof, root, leaf)) return false;
        }

        return true;
    }
}
