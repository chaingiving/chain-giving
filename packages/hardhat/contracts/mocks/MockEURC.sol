// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice 6-decimal mock of Circle EURC for local Hardhat testing only. Open mint — never deploy publicly.
contract MockEURC is ERC20, ERC20Permit {
    constructor() ERC20("Euro Coin", "EURC") ERC20Permit("Euro Coin") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
