// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CGDistribution — Token distribution to beneficiary lists
/// @notice Holds a beneficiary list with token amounts. Transitions INACTIVE → READY → DISTRIBUTED.
contract CGDistribution is Ownable {
	using SafeERC20 for IERC20;
	enum State {
		INACTIVE,
		READY,
		DISTRIBUTED
	}

	IERC20 public immutable token;
	address[] public beneficiaries;
	uint256[] public amounts;
	State public state;

	event BeneficiariesSet(uint256 count, uint256 totalAmount);
	event DistributionReady();
	event TokensDistributed(uint256 count, uint256 totalAmount);

	error NotInState(State expected, State actual);
	error ArrayLengthMismatch();
	error EmptyBeneficiaries();
	error InsufficientTokenBalance(uint256 required, uint256 available);
	error ZeroAmount();
	error ZeroAddress();

	constructor(address owner_, IERC20 token_) Ownable(owner_) {
		token = token_;
		state = State.INACTIVE;
	}

	/// @notice Set or replace the beneficiary list. Only when INACTIVE.
	function setBeneficiaries(
		address[] calldata beneficiaries_,
		uint256[] calldata amounts_
	) external onlyOwner {
		if (state != State.INACTIVE)
			revert NotInState(State.INACTIVE, state);
		if (beneficiaries_.length != amounts_.length)
			revert ArrayLengthMismatch();
		if (beneficiaries_.length == 0) revert EmptyBeneficiaries();

		for (uint256 i = 0; i < beneficiaries_.length; i++) {
			if (beneficiaries_[i] == address(0)) revert ZeroAddress();
			if (amounts_[i] == 0) revert ZeroAmount();
		}

		beneficiaries = beneficiaries_;
		amounts = amounts_;

		uint256 total = totalRequired();
		emit BeneficiariesSet(beneficiaries_.length, total);
	}

	/// @notice Transition to READY. Requires contract holds enough tokens.
	function markReady() external onlyOwner {
		if (state != State.INACTIVE)
			revert NotInState(State.INACTIVE, state);
		if (beneficiaries.length == 0) revert EmptyBeneficiaries();

		uint256 required = totalRequired();
		uint256 balance = token.balanceOf(address(this));
		if (balance < required)
			revert InsufficientTokenBalance(required, balance);

		state = State.READY;
		emit DistributionReady();
	}

	/// @notice Transfer tokens to all beneficiaries. Transitions to DISTRIBUTED.
	function distribute() external onlyOwner {
		if (state != State.READY)
			revert NotInState(State.READY, state);

		uint256 total;
		for (uint256 i = 0; i < beneficiaries.length; i++) {
			token.safeTransfer(beneficiaries[i], amounts[i]);
			total += amounts[i];
		}

		state = State.DISTRIBUTED;
		emit TokensDistributed(beneficiaries.length, total);
	}

	/// @notice Total tokens required for all beneficiaries.
	function totalRequired() public view returns (uint256 total) {
		for (uint256 i = 0; i < amounts.length; i++) {
			total += amounts[i];
		}
	}

	/// @notice Number of beneficiaries.
	function beneficiaryCount() external view returns (uint256) {
		return beneficiaries.length;
	}
}
