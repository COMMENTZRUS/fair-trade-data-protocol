// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

interface InitializableShare {
    function init(
        address splitter_,
        string calldata name_,
        string calldata symbol_,
        uint256 mintAmount,
        address sendTo,
        address minter_
    ) external;
}
