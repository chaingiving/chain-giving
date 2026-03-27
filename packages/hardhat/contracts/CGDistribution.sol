// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title CGDistribution — ERC-1155 token distribution to a beneficiary list
/// @notice Holds tokens of a specific ERC-1155 type and distributes them to beneficiaries.
///         Transitions: DRAFT → READY → DISTRIBUTED.
///         Implements IERC1155Receiver so it can receive tokens via safe transfers.
contract CGDistribution is Ownable, ERC165, IERC1155Receiver {
	enum State {
		DRAFT,
		READY,
		DISTRIBUTED
	}

	IERC1155 public immutable token;
	uint256 public immutable tokenId;

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

	constructor(address owner_, IERC1155 token_, uint256 tokenId_) Ownable(owner_) {
		token = token_;
		tokenId = tokenId_;
		state = State.DRAFT;
	}

	/// @notice Set or replace the beneficiary list. Only when DRAFT.
	///         For NFT-like distributions set each amount to 1; for fungible use any amount.
	function setBeneficiaries(
		address[] calldata beneficiaries_,
		uint256[] calldata amounts_
	) external onlyOwner {
		if (state != State.DRAFT) revert NotInState(State.DRAFT, state);
		if (beneficiaries_.length != amounts_.length) revert ArrayLengthMismatch();
		if (beneficiaries_.length == 0) revert EmptyBeneficiaries();

		for (uint256 i = 0; i < beneficiaries_.length; i++) {
			if (beneficiaries_[i] == address(0)) revert ZeroAddress();
			if (amounts_[i] == 0) revert ZeroAmount();
		}

		beneficiaries = beneficiaries_;
		amounts = amounts_;

		emit BeneficiariesSet(beneficiaries_.length, totalRequired());
	}

	/// @notice Append new beneficiaries to the existing list. Only when DRAFT.
	function addBeneficiaries(
		address[] calldata newBeneficiaries_,
		uint256[] calldata newAmounts_
	) external onlyOwner {
		if (state != State.DRAFT) revert NotInState(State.DRAFT, state);
		if (newBeneficiaries_.length != newAmounts_.length) revert ArrayLengthMismatch();
		if (newBeneficiaries_.length == 0) revert EmptyBeneficiaries();

		for (uint256 i = 0; i < newBeneficiaries_.length; i++) {
			if (newBeneficiaries_[i] == address(0)) revert ZeroAddress();
			if (newAmounts_[i] == 0) revert ZeroAmount();
			beneficiaries.push(newBeneficiaries_[i]);
			amounts.push(newAmounts_[i]);
		}

		emit BeneficiariesSet(beneficiaries.length, totalRequired());
	}

	/// @notice Remove beneficiaries by address. Silently skips addresses not in the list. Only when DRAFT.
	/// @dev O(n*m) where n = current list length and m = toRemove_ length. Acceptable for typical
	///      charity distribution sizes; avoid very large arrays to stay within block gas limits.
	function removeBeneficiaries(address[] calldata toRemove_) external onlyOwner {
		if (state != State.DRAFT) revert NotInState(State.DRAFT, state);
		if (toRemove_.length == 0) revert EmptyBeneficiaries();

		for (uint256 r = 0; r < toRemove_.length; r++) {
			for (uint256 i = 0; i < beneficiaries.length; i++) {
				if (beneficiaries[i] == toRemove_[r]) {
					uint256 last = beneficiaries.length - 1;
					beneficiaries[i] = beneficiaries[last];
					amounts[i] = amounts[last];
					beneficiaries.pop();
					amounts.pop();
					break;
				}
			}
		}

		emit BeneficiariesSet(beneficiaries.length, beneficiaries.length > 0 ? totalRequired() : 0);
	}

	/// @notice Transition to READY. Requires the contract holds sufficient tokens.
	function markReady() external onlyOwner {
		if (state != State.DRAFT) revert NotInState(State.DRAFT, state);
		if (beneficiaries.length == 0) revert EmptyBeneficiaries();

		uint256 required = totalRequired();
		uint256 balance = token.balanceOf(address(this), tokenId);
		if (balance < required) revert InsufficientTokenBalance(required, balance);

		state = State.READY;
		emit DistributionReady();
	}

	/// @notice Transfer tokens to all beneficiaries. Transitions to DISTRIBUTED.
	function distribute() external onlyOwner {
		if (state != State.READY) revert NotInState(State.READY, state);

		uint256 total;
		for (uint256 i = 0; i < beneficiaries.length; i++) {
			token.safeTransferFrom(address(this), beneficiaries[i], tokenId, amounts[i], "");
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

	function beneficiaryCount() external view returns (uint256) {
		return beneficiaries.length;
	}

	function getBeneficiaries() external view returns (address[] memory) {
		return beneficiaries;
	}

	function getAmounts() external view returns (uint256[] memory) {
		return amounts;
	}

	// ── IERC1155Receiver ─────────────────────────────────────────────────────

	function onERC1155Received(
		address,
		address,
		uint256,
		uint256,
		bytes calldata
	) external pure override returns (bytes4) {
		return this.onERC1155Received.selector;
	}

	function onERC1155BatchReceived(
		address,
		address,
		uint256[] calldata,
		uint256[] calldata,
		bytes calldata
	) external pure override returns (bytes4) {
		return this.onERC1155BatchReceived.selector;
	}

	function supportsInterface(bytes4 interfaceId)
		public
		view
		override(ERC165, IERC165)
		returns (bool)
	{
		return
			interfaceId == type(IERC1155Receiver).interfaceId ||
			super.supportsInterface(interfaceId);
	}
}
