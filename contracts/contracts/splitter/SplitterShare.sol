// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISplitter.sol";

abstract contract SplitterShare is IERC20 {
    ISplitter public splitter;

    /// @dev Must be invoked before any balance or totalSupply change.
    function _notifySplitterBeforeSharesChange(address from, address to) internal {
        if (from == address(0) || to == address(0)) {
            splitter.saveRPS();
        }
        if (from != address(0)) {
            splitter.saveAccrual(from);
        }
        if (to != address(0)) {
            splitter.saveAccrual(to);
        }
    }
}
