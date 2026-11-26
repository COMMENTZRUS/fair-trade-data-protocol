// SPDX-License-Identifier: MIT
// Adapted & hardened from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AutoPullSplitter.sol";
import "../interfaces/InitializableSplitter.sol";
import "./Errors.sol";

/// @title ERC20SharesSplitter
/// @notice Tokenized / DAO-governed Data Union splitter whose shares are tracked by an ERC-20 `SplitterShare`.
/// @dev Hardened vs upstream:
///  - Fixed `init()` checking `upstreamSplitter_` parameter instead of uninitialized storage var.
contract ERC20SharesSplitter is AutoPullSplitter, InitializableSplitter {
    using SafeERC20 for IERC20;

    address public sharesToken;
    address public initializer;

    constructor() {
        initializer = msg.sender;
    }

    function init(
        address sharesToken_,
        address[] calldata tokens,
        address upstreamSplitter_,
        uint256 configOptions_
    ) public override {
        if (sharesToken != address(0)) revert AlreadyInitialized();
        if (sharesToken_ == address(0)) revert InvalidAddress();
        if (tokens.length == 0) revert EmptyTokenList();
        if (initializer != address(0) && msg.sender != initializer) revert NotInitializer();
        sharesToken = sharesToken_;
        if (upstreamSplitter_ != address(0)) {
            _setUpstreamSplitter(ISplitter(upstreamSplitter_));
        }
        configOptions = configOptions_;
        for (uint256 i = 0; i < tokens.length; i++) {
            _addSupportedToken(tokens[i]);
        }
    }

    function shares(address shareholder) public view override returns (uint256) {
        return IERC20(sharesToken).balanceOf(shareholder);
    }

    function totalShares() public view override returns (uint256) {
        return IERC20(sharesToken).totalSupply();
    }

    function recoverFrozenTokens(
        address token,
        address recipient,
        uint256 amount
    ) public {
        if (initializer == address(0) || msg.sender != initializer) revert NotOwner();
        if (tokenSupported(token)) revert SupportedTokenNotAvailableForRecover(token);
        if (token == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed(address(0), recipient, amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }
}
