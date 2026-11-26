// SPDX-License-Identifier: MIT
// Adapted & hardened from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AbstractSplitter.sol";
import "../interfaces/ISplitter.sol";

/// @title AutoPullSplitter
/// @notice Enables cascading Tier-1 -> Tier-2 Data Union sub-splitters.
/// @dev Hardened vs upstream:
///  - Pulls on-demand from `upstreamSplitter` inside `_withdraw()` if local balance is below requested amount.
///  - `withdrawAllIgnoreUpstream` is protected by `nonReentrant`.
abstract contract AutoPullSplitter is AbstractSplitter {
    ISplitter public upstreamSplitter;

    event NewUpstreamSplitter(address indexed upstreamSplitter);

    function totalReceived(address tokenAddress) public view virtual override returns (uint256) {
        if (address(upstreamSplitter) == address(0)) {
            return super.totalReceived(tokenAddress);
        }
        return upstreamSplitter.availableAllotment(address(this), tokenAddress) + super.totalReceived(tokenAddress);
    }

    function saveRPS() public virtual override {
        if (address(upstreamSplitter) != address(0)) {
            uint256 len = supportedTokens.length;
            for (uint256 i = 0; i < len; i++) {
                address token = supportedTokens[i];
                if (upstreamSplitter.availableAllotment(address(this), token) > 0) {
                    upstreamSplitter.withdrawAll(address(this), token);
                }
            }
        }
        super.saveRPS();
    }

    function _withdraw(
        address shareholder,
        address tokenAddress,
        address to,
        uint256 amount
    ) internal virtual override {
        if (amount == 0) return;
        if (address(upstreamSplitter) != address(0)) {
            uint256 localBal = tokenAddress == address(0)
                ? address(this).balance
                : IERC20(tokenAddress).balanceOf(address(this));
            if (localBal < amount) {
                upstreamSplitter.withdrawAll(address(this), tokenAddress);
            }
        }
        super._withdraw(shareholder, tokenAddress, to, amount);
    }

    function _setUpstreamSplitter(ISplitter newUpstream) internal {
        saveRPS();
        upstreamSplitter = newUpstream;
        emit NewUpstreamSplitter(address(newUpstream));
    }

    /// @notice Emergency escape hatch if upstream malfunctions: withdraws using only local balance.
    function withdrawAllIgnoreUpstream(
        address shareholder,
        address tokenAddress
    ) public nonReentrant returns (uint256) {
        ISplitter upstream = upstreamSplitter;
        upstreamSplitter = ISplitter(address(0));
        uint256 amount = availableAllotment(shareholder, tokenAddress);
        _executeWithdraw(shareholder, tokenAddress, amount);
        upstreamSplitter = upstream;
        return amount;
    }
}
