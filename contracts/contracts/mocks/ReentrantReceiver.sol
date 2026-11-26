// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISplitter.sol";

/// @notice Malicious receiver attempting native ETH reentrancy during splitter withdrawal.
contract ReentrantReceiver {
    ISplitter public target;
    bool public attempted;
    bool public reentrancySucceeded;

    constructor(address target_) {
        target = ISplitter(target_);
    }

    function attack() external {
        target.withdrawAll(address(this), address(0));
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try target.withdrawAll(address(this), address(0)) {
                reentrancySucceeded = true;
            } catch {
                reentrancySucceeded = false;
            }
        }
    }
}
