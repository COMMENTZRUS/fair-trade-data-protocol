// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FtdToken
/// @notice Fair Trade Data (FTD) ecosystem utility, staking, and governance token with a hard supply cap.
contract FtdToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    uint256 public immutable maxSupply;

    error MaxSupplyExceeded(uint256 requested, uint256 remaining);
    error InvalidAddress();

    constructor(
        address initialOwner,
        address initialTreasury,
        uint256 initialMint,
        uint256 maxSupply_
    ) ERC20("Fair Trade Data", "FTD") ERC20Permit("Fair Trade Data") Ownable(initialOwner) {
        if (initialTreasury == address(0)) revert InvalidAddress();
        if (initialMint > maxSupply_) revert MaxSupplyExceeded(initialMint, maxSupply_);
        maxSupply = maxSupply_;
        if (initialMint > 0) {
            _mint(initialTreasury, initialMint);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        uint256 remaining = maxSupply - totalSupply();
        if (amount > remaining) revert MaxSupplyExceeded(amount, remaining);
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
