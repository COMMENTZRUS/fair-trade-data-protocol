// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

interface InitializableSplitter {
    function init(
        address ownerOrSharesToken,
        address[] calldata tokens,
        address upstreamSplitter_,
        uint256 configOptions_
    ) external;
}
