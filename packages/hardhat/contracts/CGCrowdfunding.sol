// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CGCrowdfunding — ETH fundraising with escrow and refunds
/// @notice Collects ETH toward a funding target. Supports donor refunds on cancellation.
contract CGCrowdfunding is Ownable {
	enum State {
		UNFUNDED,
		FUNDED,
		WITHDRAWN,
		CANCELLED
	}

	uint256 public immutable fundingTarget;
	uint256 public immutable deadline;
	State public state;
	mapping(address => uint256) public contributions;
	uint256 public totalRaised;

	event ContributionReceived(address indexed donor, uint256 amount);
	event ContributionCancelled(address indexed donor, uint256 amount);
	event CrowdfundingFunded(uint256 totalRaised);
	event CrowdfundingCancelled();
	event FundsWithdrawn(address indexed to, uint256 amount);
	event RefundClaimed(address indexed donor, uint256 amount);

	error NotInState(State expected, State actual);
	error DeadlinePassed();
	error NoContribution();
	error TransferFailed();
	error ZeroTarget();
	error DeadlineInPast();
	error ZeroAddress();

	constructor(
		address owner_,
		uint256 target_,
		uint256 deadline_
	) Ownable(owner_) {
		if (target_ == 0) revert ZeroTarget();
		if (deadline_ <= block.timestamp) revert DeadlineInPast();
		fundingTarget = target_;
		deadline = deadline_;
		state = State.UNFUNDED;
	}

	/// @notice Donate ETH. Transitions to FUNDED when target is met.
	function contribute() external payable {
		_contribute(msg.sender);
	}

	/// @notice Donate ETH on behalf of a donor. Only callable by owner (the program).
	function contributeFor(address donor) external payable onlyOwner {
		if (donor == address(0)) revert ZeroAddress();
		_contribute(donor);
	}

	function _contribute(address donor) internal {
		if (state != State.UNFUNDED)
			revert NotInState(State.UNFUNDED, state);
		if (block.timestamp > deadline) revert DeadlinePassed();
		if (msg.value == 0) revert NoContribution();

		contributions[donor] += msg.value;
		totalRaised += msg.value;

		emit ContributionReceived(donor, msg.value);

		if (totalRaised >= fundingTarget) {
			state = State.FUNDED;
			emit CrowdfundingFunded(totalRaised);
		}
	}

	/// @notice Withdraw own contribution while UNFUNDED.
	function cancelContribution() external {
		if (state != State.UNFUNDED)
			revert NotInState(State.UNFUNDED, state);

		uint256 amount = contributions[msg.sender];
		if (amount == 0) revert NoContribution();

		contributions[msg.sender] = 0;
		totalRaised -= amount;

		(bool success, ) = msg.sender.call{value: amount}("");
		if (!success) revert TransferFailed();

		emit ContributionCancelled(msg.sender, amount);
	}

	/// @notice Transfer full balance to `to`. Only when FUNDED.
	function withdraw(address to) external onlyOwner {
		if (state != State.FUNDED)
			revert NotInState(State.FUNDED, state);

		state = State.WITHDRAWN;
		uint256 balance = address(this).balance;

		(bool success, ) = to.call{value: balance}("");
		if (!success) revert TransferFailed();

		emit FundsWithdrawn(to, balance);
	}

	/// @notice Cancel the crowdfunding. Only if UNFUNDED.
	function cancel() external onlyOwner {
		if (state != State.UNFUNDED)
			revert NotInState(State.UNFUNDED, state);

		state = State.CANCELLED;
		emit CrowdfundingCancelled();
	}

	/// @notice Claim refund after CANCELLED.
	function refund() external {
		if (state != State.CANCELLED)
			revert NotInState(State.CANCELLED, state);

		uint256 amount = contributions[msg.sender];
		if (amount == 0) revert NoContribution();

		contributions[msg.sender] = 0;
		totalRaised -= amount;

		(bool success, ) = msg.sender.call{value: amount}("");
		if (!success) revert TransferFailed();

		emit RefundClaimed(msg.sender, amount);
	}
}
