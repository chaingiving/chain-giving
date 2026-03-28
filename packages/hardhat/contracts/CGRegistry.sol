// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CGOrganization} from "./CGOrganization.sol";
import {CGProgramFactory} from "./CGProgramFactory.sol";

/// @title CGRegistry — Directory of all CGOrganization instances
/// @notice Only the registry owner (deployer) can create organizations.
contract CGRegistry is Ownable {
	CGProgramFactory public immutable programFactory;
	address[] public organizations;
	mapping(address => bool) public isOrganization;

	event OrganizationCreated(address indexed organization, address indexed owner, string name);

	error EmptyName();

	constructor(CGProgramFactory programFactory_) Ownable(msg.sender) {
		programFactory = programFactory_;
	}

	/// @notice Deploy a new CGOrganization owned by msg.sender. Only callable by registry owner.
	function createOrganization(string calldata name_) external onlyOwner returns (address) {
		if (bytes(name_).length == 0) revert EmptyName();

		CGOrganization org = new CGOrganization(msg.sender, name_, programFactory);
		address addr = address(org);
		organizations.push(addr);
		isOrganization[addr] = true;

		// Authorize the new organization to use the factory
		programFactory.authorizeCaller(addr, true);

		emit OrganizationCreated(addr, msg.sender, name_);
		return addr;
	}

	function organizationCount() external view returns (uint256) {
		return organizations.length;
	}

	/// @notice Paginated read of organization addresses.
	function getOrganizations(uint256 offset, uint256 limit) external view returns (address[] memory) {
		uint256 len = organizations.length;
		if (offset >= len) return new address[](0);

		uint256 end = offset + limit;
		if (end > len) end = len;
		uint256 size = end - offset;

		address[] memory result = new address[](size);
		for (uint256 i = 0; i < size; i++) {
			result[i] = organizations[offset + i];
		}
		return result;
	}
}
