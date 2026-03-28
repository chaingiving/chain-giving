// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CGProgram} from "./CGProgram.sol";
import {CGComponentFactory} from "./CGComponentFactory.sol";

/// @title CGProgramFactory — Deploys CGProgram instances
/// @notice Only authorized callers (CGOrganizations created via CGRegistry) can use createProgram.
///         Ownership should be transferred to CGRegistry after deployment.
///         A shared CGComponentFactory is injected so CGProgram never uses `new` directly,
///         keeping every contract under the 24 KB Spurious Dragon limit.
contract CGProgramFactory is Ownable {
	CGComponentFactory public immutable componentFactory;

	mapping(address => bool) public authorizedCallers;

	event ProgramDeployed(address indexed program, address indexed owner, string name);
	event CallerAuthorized(address indexed caller, bool authorized);

	error Unauthorized();

	constructor(
		CGComponentFactory componentFactory_
	) Ownable(msg.sender) {
		componentFactory = componentFactory_;
	}

	/// @notice Authorize or deauthorize a caller (e.g. a CGOrganization). Only callable by owner (CGRegistry).
	function authorizeCaller(address caller_, bool authorized_) external onlyOwner {
		authorizedCallers[caller_] = authorized_;
		emit CallerAuthorized(caller_, authorized_);
	}

	/// @notice Deploy a new CGProgram. Only callable by authorized callers.
	function createProgram(
		address owner_,
		string calldata name_,
		bool lockDistributions_
	) external returns (address) {
		if (!authorizedCallers[msg.sender]) revert Unauthorized();
		CGProgram program = new CGProgram(
			owner_,
			name_,
			lockDistributions_,
			componentFactory
		);
		address addr = address(program);
		emit ProgramDeployed(addr, owner_, name_);
		return addr;
	}
}
