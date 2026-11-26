// SPDX-License-Identifier: MIT
// Adapted & hardened from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AutoPullSplitter.sol";
import "../interfaces/InitializableSplitter.sol";
import "./Errors.sol";

struct HolderAndShares {
    address shareholder;
    uint256 shares;
}

/// @title AdminControlledSplitter
/// @notice Non-transferable, contribution-weighted Data Union splitter with EIP-712 batch meta-transactions.
/// @dev Hardened vs upstream:
///  - Fixed `init()` checking `upstreamSplitter_` parameter (instead of uninitialized storage var).
///  - Fixed `setSharesMultiMeta()` calling internal `_setShares()` (instead of `onlyOwner` `setShares()`).
///  - Fixed `setSharesMultiMeta()` EIP-712 encoding order (`nonce, deadline`) matching `_SETSHARES_TYPEHASH`.
///  - Added `transferOwnership()` for multisig / Governor handoff.
contract AdminControlledSplitter is AutoPullSplitter, InitializableSplitter {
    using SafeERC20 for IERC20;

    event NewOwner(address indexed newOwner);
    event SetShares(address indexed shareholder, uint256 oldShares, uint256 newShares);

    bytes32 public constant _SETSHARES_TYPEHASH = keccak256(
        "SetSharesMulti(HolderAndShares[] updates,uint256 nonce,uint256 deadline)HolderAndShares(address shareholder,uint256 shares)"
    );
    bytes32 public constant _HOLDERANDSHARES_TYPEHASH = keccak256(
        "HolderAndShares(address shareholder,uint256 shares)"
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    address public owner;
    mapping(address => uint256) private _shares;
    uint256 private _totalShares;

    constructor(address owner_) {
        if (owner_ != address(0)) {
            owner = owner_;
            emit NewOwner(owner_);
        }
    }

    function init(
        address newOwnerIfUnset,
        address[] calldata tokens,
        address upstreamSplitter_,
        uint256 configOptions_
    ) public override {
        if (supportedTokens.length != 0) revert AlreadyInitialized();
        if (tokens.length == 0) revert EmptyTokenList();
        if (owner != address(0) && owner != msg.sender) revert NotInitializer();
        if (owner == address(0)) {
            if (newOwnerIfUnset == address(0)) revert InvalidAddress();
            owner = newOwnerIfUnset;
            emit NewOwner(newOwnerIfUnset);
        }
        if (upstreamSplitter_ != address(0)) {
            _setUpstreamSplitter(ISplitter(upstreamSplitter_));
        }
        configOptions = configOptions_;
        for (uint256 i = 0; i < tokens.length; i++) {
            _addSupportedToken(tokens[i]);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        owner = newOwner;
        emit NewOwner(newOwner);
    }

    function setSharesMulti(HolderAndShares[] calldata hs) public onlyOwner {
        _setSharesMulti(hs);
    }

    function _setSharesMulti(HolderAndShares[] calldata hs) internal {
        for (uint256 i = 0; i < hs.length; i++) {
            _setShares(hs[i].shareholder, hs[i].shares);
        }
    }

    function _encodeHolderAndSharesArray(
        HolderAndShares[] calldata updates
    ) internal pure returns (bytes32) {
        bytes32[] memory slots = new bytes32[](updates.length);
        for (uint256 i = 0; i < updates.length; i++) {
            slots[i] = keccak256(
                abi.encode(_HOLDERANDSHARES_TYPEHASH, updates[i].shareholder, updates[i].shares)
            );
        }
        return keccak256(abi.encodePacked(slots));
    }

    /// @notice Relayer-executable EIP-712 batch share update signed by `owner`.
    function setSharesMultiMeta(
        HolderAndShares[] calldata hsm,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        if (block.timestamp >= deadline) revert SignatureExpired();
        uint256 nonce = _useNonce(owner);
        bytes32 structHash = keccak256(
            abi.encode(_SETSHARES_TYPEHASH, _encodeHolderAndSharesArray(hsm), nonce, deadline)
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        if (owner != ECDSA.recover(hash, v, r, s)) revert InvalidSignature();
        _setSharesMulti(hsm);
    }

    function setShares(address shareholder, uint256 newShares) public onlyOwner {
        _setShares(shareholder, newShares);
    }

    function _setShares(address shareholder, uint256 newShares) internal {
        saveRPS();
        saveAccrual(shareholder);
        uint256 current = _shares[shareholder];
        if (newShares == current) return;
        if (newShares > current) {
            _totalShares += newShares - current;
        } else {
            _totalShares -= current - newShares;
        }
        emit SetShares(shareholder, current, newShares);
        _shares[shareholder] = newShares;
    }

    function increaseShares(address shareholder, uint256 amount) public onlyOwner {
        _setShares(shareholder, _shares[shareholder] + amount);
    }

    function decreaseShares(address shareholder, uint256 amount) public onlyOwner {
        _setShares(shareholder, _shares[shareholder] - amount);
    }

    function totalShares() public view virtual override returns (uint256) {
        return _totalShares;
    }

    function shares(address shareholder) public view virtual override returns (uint256) {
        return _shares[shareholder];
    }

    function setUpstreamSplitter(ISplitter newUpstream) public onlyOwner {
        _setUpstreamSplitter(newUpstream);
    }

    function recoverFrozenTokens(
        address token,
        address recipient,
        uint256 amount
    ) public onlyOwner {
        if (tokenSupported(token)) revert SupportedTokenNotAvailableForRecover(token);
        if (token == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed(address(0), recipient, amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }
}
