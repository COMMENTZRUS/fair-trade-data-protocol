// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

interface IShared {
    function shares(address shareholder) external view returns (uint256);

    function totalShares() external view returns (uint256);
}
