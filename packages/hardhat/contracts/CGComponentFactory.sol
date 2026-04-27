// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { CGToken } from "./CGToken.sol";
import { CGCrowdfunding } from "./CGCrowdfunding.sol";
import { CGDistribution } from "./CGDistribution.sol";

/// @title CGComponentFactory — Deploys CGToken, CGCrowdfunding and CGDistribution instances
/// @notice Extracted so CGProgram does not embed child-contract creation bytecode,
///         keeping every contract under the 24 KB Spurious Dragon limit.
contract CGComponentFactory {
    function createToken(address owner_) external returns (address) {
        CGToken t = new CGToken(owner_);
        return address(t);
    }

    function createCrowdfunding(
        address owner_,
        address token_,
        uint256 target_,
        uint256 deadline_
    ) external returns (address) {
        CGCrowdfunding c = new CGCrowdfunding(owner_, token_, target_, deadline_);
        return address(c);
    }

    function createDistribution(address owner_, IERC1155 token_, uint256 tokenId_) external returns (address) {
        CGDistribution d = new CGDistribution(owner_, token_, tokenId_);
        return address(d);
    }
}
