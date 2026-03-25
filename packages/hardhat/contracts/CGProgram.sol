// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CGToken} from "./CGToken.sol";
import {CGCrowdfunding} from "./CGCrowdfunding.sol";
import {CGDistribution} from "./CGDistribution.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CGProgram — Orchestrates crowdfunding and token distributions
/// @notice Top-level contract tying one crowdfunding to one-or-more distributions.
contract CGProgram is Ownable {
	enum State {
		ACTIVE,
		EXECUTING,
		COMPLETED,
		CANCELLED
	}

	struct TokenInfo {
		address addr;
		string name;
		string symbol;
		uint256 totalSupply;
	}

	struct CrowdfundingInfo {
		address addr;
		uint256 fundingTarget;
		uint256 deadline;
		CGCrowdfunding.State state;
		uint256 totalRaised;
	}

	struct DistributionInfo {
		address addr;
		CGDistribution.State state;
		uint256 beneficiaryCount;
		uint256 totalRequired;
		address[] beneficiaries;
		uint256[] amounts;
	}

	string public name;
	bool public immutable lockDistributions;
	CGToken public token;
	CGCrowdfunding public crowdfunding;
	CGDistribution[] public distributions;
	State public state;

	event ProgramCreated(string name, address token, bool lockDistributions);
	event CrowdfundingSet(address crowdfunding);
	event DistributionCreated(uint256 index, address distribution);
	event ProgramExecuted();
	event ProgramCancelled();

	error ProgramNotActive();
	error CrowdfundingAlreadySet();
	error NoCrowdfunding();
	error NoDistributions();
	error CrowdfundingNotFunded();
	error DistributionNotReady(uint256 index);
	error DistributionsLocked();

	constructor(
		address owner_,
		string memory name_,
		string memory tokenName_,
		string memory tokenSymbol_,
		bool lockDistributions_
	) Ownable(owner_) {
		name = name_;
		lockDistributions = lockDistributions_;
		token = new CGToken(tokenName_, tokenSymbol_, address(this));
		state = State.ACTIVE;

		emit ProgramCreated(name_, address(token), lockDistributions_);
	}

	/// @notice Deploy and attach a CGCrowdfunding.
	function setCrowdfunding(
		uint256 target_,
		uint256 deadline_
	) external onlyOwner {
		if (state != State.ACTIVE) revert ProgramNotActive();
		if (address(crowdfunding) != address(0))
			revert CrowdfundingAlreadySet();

		crowdfunding = new CGCrowdfunding(address(this), target_, deadline_);
		emit CrowdfundingSet(address(crowdfunding));
	}

	/// @notice Deploy a new CGDistribution linked to the program's token.
	function createDistribution() external onlyOwner returns (address) {
		if (state != State.ACTIVE) revert ProgramNotActive();
		if (lockDistributions && _crowdfundingHasContributions())
			revert DistributionsLocked();

		CGDistribution dist = new CGDistribution(
			address(this),
			IERC20(address(token))
		);
		distributions.push(dist);

		uint256 index = distributions.length - 1;
		emit DistributionCreated(index, address(dist));
		return address(dist);
	}

	/// @notice Proxy call to set beneficiaries on a distribution.
	function setBeneficiaries(
		uint256 distributionIndex,
		address[] calldata beneficiaries_,
		uint256[] calldata amounts_
	) external onlyOwner {
		if (state != State.ACTIVE) revert ProgramNotActive();
		if (lockDistributions && _crowdfundingHasContributions())
			revert DistributionsLocked();

		distributions[distributionIndex].setBeneficiaries(
			beneficiaries_,
			amounts_
		);
	}

	/// @notice Mark a distribution as READY after minting tokens to it.
	function markDistributionReady(
		uint256 distributionIndex
	) external onlyOwner {
		if (state != State.ACTIVE) revert ProgramNotActive();

		CGDistribution dist = distributions[distributionIndex];
		uint256 required = dist.totalRequired();

		// Mint tokens to the distribution contract
		token.mint(address(dist), required);

		// Mark it ready
		dist.markReady();
	}

	/// @notice Contribute to the crowdfunding. Enforces lock-distributions rule.
	function contribute() external payable {
		if (state != State.ACTIVE) revert ProgramNotActive();
		if (address(crowdfunding) == address(0)) revert NoCrowdfunding();

		if (lockDistributions) {
			// All distributions must be READY before accepting contributions
			if (distributions.length == 0) revert NoDistributions();
			for (uint256 i = 0; i < distributions.length; i++) {
				if (
					distributions[i].state() !=
					CGDistribution.State.READY
				) revert DistributionNotReady(i);
			}
		}

		crowdfunding.contributeFor{value: msg.value}(msg.sender);
	}

	/// @notice Core action: withdraw funds + mint tokens + distribute — all in one tx.
	function execute() external onlyOwner {
		if (state != State.ACTIVE) revert ProgramNotActive();
		if (address(crowdfunding) == address(0)) revert NoCrowdfunding();
		if (distributions.length == 0) revert NoDistributions();

		// Verify crowdfunding is FUNDED
		if (
			crowdfunding.state() != CGCrowdfunding.State.FUNDED
		) revert CrowdfundingNotFunded();

		// Verify all distributions are READY
		for (uint256 i = 0; i < distributions.length; i++) {
			if (
				distributions[i].state() != CGDistribution.State.READY
			) revert DistributionNotReady(i);
		}

		state = State.EXECUTING;

		// Withdraw crowdfunding funds to the program owner
		crowdfunding.withdraw(owner());

		// Distribute tokens to all beneficiaries
		for (uint256 i = 0; i < distributions.length; i++) {
			distributions[i].distribute();
		}

		state = State.COMPLETED;
		emit ProgramExecuted();
	}

	/// @notice Cancel the program: cancel crowdfunding and void distributions.
	function cancel() external onlyOwner {
		if (state != State.ACTIVE) revert ProgramNotActive();

		state = State.CANCELLED;

		// Cancel crowdfunding if it exists and is still UNFUNDED
		if (
			address(crowdfunding) != address(0) &&
			crowdfunding.state() == CGCrowdfunding.State.UNFUNDED
		) {
			crowdfunding.cancel();
		}

		emit ProgramCancelled();
	}

	/// @notice Number of distributions in this program.
	function distributionCount() external view returns (uint256) {
		return distributions.length;
	}

	/// @notice Return token info in a single call.
	function getTokenInfo()
		external
		view
		returns (TokenInfo memory)
	{
		return
			TokenInfo({
				addr: address(token),
				name: token.name(),
				symbol: token.symbol(),
				totalSupply: token.totalSupply()
			});
	}

	/// @notice Return all crowdfunding info in a single call.
	function getCrowdfundingInfo()
		external
		view
		returns (CrowdfundingInfo memory info)
	{
		if (address(crowdfunding) == address(0)) return info;

		info = CrowdfundingInfo({
			addr: address(crowdfunding),
			fundingTarget: crowdfunding.fundingTarget(),
			deadline: crowdfunding.deadline(),
			state: crowdfunding.state(),
			totalRaised: crowdfunding.totalRaised()
		});
	}

	/// @notice Return info for a single distribution.
	function getDistributionInfo(
		uint256 index
	) public view returns (DistributionInfo memory) {
		CGDistribution dist = distributions[index];
		return
			DistributionInfo({
				addr: address(dist),
				state: dist.state(),
				beneficiaryCount: dist.beneficiaryCount(),
				totalRequired: dist.totalRequired(),
				beneficiaries: dist.getBeneficiaries(),
				amounts: dist.getAmounts()
			});
	}

	/// @notice Return info for all distributions.
	function getAllDistributionsInfo()
		external
		view
		returns (DistributionInfo[] memory infos)
	{
		infos = new DistributionInfo[](distributions.length);
		for (uint256 i = 0; i < distributions.length; i++) {
			infos[i] = getDistributionInfo(i);
		}
	}

	function _crowdfundingHasContributions() internal view returns (bool) {
		return
			address(crowdfunding) != address(0) &&
			crowdfunding.totalRaised() > 0;
	}

}
