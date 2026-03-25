// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CGToken — ERC-20 aid token for a Chain.Giving program
/// @notice One deployment per program. Owner (typically CGProgram) controls minting.
contract CGToken is ERC20, ERC20Burnable, Ownable {
	constructor(
		string memory name_,
		string memory symbol_,
		address owner_
	) ERC20(name_, symbol_) Ownable(owner_) {}

	/// @notice Mint tokens to a recipient. Only callable by owner.
	function mint(address to, uint256 amount) external onlyOwner {
		_mint(to, amount);
	}
}
