// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CGProgramFactory } from "./CGProgramFactory.sol";

/// @title CGOrganization — Groups multiple CGPrograms under one owner
/// @notice Created by CGRegistry. The owner can create programs on demand via CGProgramFactory.
contract CGOrganization is Ownable {
    string public name;
    CGProgramFactory public immutable programFactory;
    address[] public programs;
    mapping(address => bool) public isProgram;

    event ProgramCreated(address indexed program, string name, bool lockDistributions);

    error EmptyName();

    constructor(address owner_, string memory name_, CGProgramFactory programFactory_) Ownable(owner_) {
        name = name_;
        programFactory = programFactory_;
    }

    /// @notice Deploy a new CGProgram owned by this organization's owner.
    function createProgram(string calldata name_, bool lockDistributions_) external onlyOwner returns (address) {
        if (bytes(name_).length == 0) revert EmptyName();
        address addr = programFactory.createProgram(owner(), name_, lockDistributions_);
        programs.push(addr);
        isProgram[addr] = true;

        emit ProgramCreated(addr, name_, lockDistributions_);
        return addr;
    }

    function programCount() external view returns (uint256) {
        return programs.length;
    }

    /// @notice Paginated read of program addresses.
    function getPrograms(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 len = programs.length;
        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;
        uint256 size = end - offset;

        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = programs[offset + i];
        }
        return result;
    }
}
