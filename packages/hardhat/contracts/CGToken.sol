// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CGToken — ERC-1155 multi-token for a Chain.Giving program
/// @notice One deployment per program. Supports multiple token types in a single contract.
///         Each type is configured independently: unlimited supply (fungible), capped supply
///         (semi-fungible badges), or supply of 1 (unique NFT). Owner (typically CGProgram)
///         controls type definition and minting.
contract CGToken is ERC1155Burnable, Ownable {
	struct TokenType {
		string name;
		string symbol;
		uint256 maxSupply;  // 0 = unlimited; 1 = unique NFT; N = capped semi-fungible
		uint256 totalMinted;
	}

	mapping(uint256 => TokenType) public tokenTypes;
	mapping(uint256 => string) private _uris;
	uint256 public nextTokenId;

	event TokenTypeDefined(
		uint256 indexed tokenId,
		string name,
		string symbol,
		uint256 maxSupply
	);

	error UnknownTokenType(uint256 tokenId);
	error ExceedsMaxSupply(uint256 tokenId, uint256 requested, uint256 remaining);

	constructor(address owner_) ERC1155("") Ownable(owner_) {}

	/// @notice Define a new token type. Returns the auto-assigned tokenId (starts at 0).
	/// @param name_      Display name (e.g. "Food Voucher")
	/// @param symbol_    Short symbol (e.g. "FOOD")
	/// @param maxSupply_ Hard cap on total minted. 0 = unlimited (fungible), 1 = unique NFT,
	///                   N = capped supply (badges, tickets, etc.)
	/// @param uri_       Optional per-type metadata URI; falls back to contract-level URI if empty
	function defineTokenType(
		string calldata name_,
		string calldata symbol_,
		uint256 maxSupply_,
		string calldata uri_
	) external onlyOwner returns (uint256 tokenId) {
		tokenId = nextTokenId++;
		tokenTypes[tokenId] = TokenType({
			name: name_,
			symbol: symbol_,
			maxSupply: maxSupply_,
			totalMinted: 0
		});
		if (bytes(uri_).length > 0) {
			_uris[tokenId] = uri_;
		}
		emit TokenTypeDefined(tokenId, name_, symbol_, maxSupply_);
	}

	/// @notice Mint tokens of a given type to a recipient. onlyOwner.
	function mint(address to, uint256 tokenId, uint256 amount) external onlyOwner {
		_validateMint(tokenId, amount);
		tokenTypes[tokenId].totalMinted += amount;
		_mint(to, tokenId, amount, "");
	}

	/// @notice Batch mint multiple token types in one call. onlyOwner.
	function mintBatch(
		address to,
		uint256[] calldata tokenIds,
		uint256[] calldata amounts
	) external onlyOwner {
		for (uint256 i = 0; i < tokenIds.length; i++) {
			_validateMint(tokenIds[i], amounts[i]);
			tokenTypes[tokenIds[i]].totalMinted += amounts[i];
		}
		_mintBatch(to, tokenIds, amounts, "");
	}

	/// @notice Per-type metadata URI; falls back to contract-level URI if none set.
	function uri(uint256 tokenId) public view override returns (string memory) {
		string memory tokenUri = _uris[tokenId];
		if (bytes(tokenUri).length > 0) return tokenUri;
		return super.uri(tokenId);
	}

	/// @notice Return full metadata for a token type.
	function getTokenType(uint256 tokenId) external view returns (TokenType memory) {
		if (tokenId >= nextTokenId) revert UnknownTokenType(tokenId);
		return tokenTypes[tokenId];
	}

	// ── Internal ─────────────────────────────────────────────────────────────

	function _validateMint(uint256 tokenId, uint256 amount) internal view {
		if (tokenId >= nextTokenId) revert UnknownTokenType(tokenId);
		TokenType storage tt = tokenTypes[tokenId];
		if (tt.maxSupply > 0 && tt.totalMinted + amount > tt.maxSupply)
			revert ExceedsMaxSupply(tokenId, amount, tt.maxSupply - tt.totalMinted);
	}
}
