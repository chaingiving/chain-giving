// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { CGToken } from "./CGToken.sol";
import { CGCrowdfunding } from "./CGCrowdfunding.sol";
import { CGDistribution } from "./CGDistribution.sol";
import { CGComponentFactory } from "./CGComponentFactory.sol";

/// @title CGProgram — Orchestrates crowdfunding and ERC-1155 token distributions
/// @notice Top-level contract tying one crowdfunding to one-or-more distributions.
///         Each distribution uses a specific token type from the shared CGToken contract.
///         Child contracts are deployed via external factories to keep bytecode under the
///         24 KB Spurious Dragon limit.
contract CGProgram is Ownable {
    enum State {
        ACTIVE,
        EXECUTING,
        COMPLETED,
        CANCELLED
    }

    struct TokenTypeInfo {
        uint256 tokenId;
        string name;
        string symbol;
        uint256 maxSupply;
        uint256 totalMinted;
        string uri;
        bool transferable;
        bool burnable;
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
        uint256 tokenId;
        CGDistribution.State state;
        uint256 beneficiaryCount;
        uint256 totalRequired;
        address[] beneficiaries;
        uint256[] amounts;
    }

    string public name;
    bool public immutable lockDistributions;
    CGComponentFactory public immutable componentFactory;
    CGToken public token;
    CGCrowdfunding public crowdfunding;
    CGDistribution[] public distributions;
    State public state;

    event ProgramCreated(string name, address token, bool lockDistributions);
    event TokenTypeDefined(
        uint256 indexed tokenId,
        string name,
        string symbol,
        uint256 maxSupply,
        bool transferable,
        bool burnable
    );
    event CrowdfundingSet(address crowdfunding);
    event DistributionCreated(uint256 index, address distribution, uint256 tokenId);
    event DistributionDeleted(uint256 index, address distribution);
    event ProgramExecuted();
    event ProgramCancelled();

    error ProgramNotActive();
    error CrowdfundingAlreadySet();
    error NoCrowdfunding();
    error NoDistributions();
    error CrowdfundingNotFunded();
    error DistributionNotReady(uint256 index);
    error DistributionsLocked();
    error ExceedsTotalSupply(uint256 tokenId, uint256 totalRequired, uint256 maxSupply);
    error DistributionAlreadyDistributed(uint256 index);
    error ContributionsExist();

    constructor(
        address owner_,
        string memory name_,
        bool lockDistributions_,
        CGComponentFactory componentFactory_
    ) Ownable(owner_) {
        name = name_;
        lockDistributions = lockDistributions_;
        componentFactory = componentFactory_;

        token = CGToken(componentFactory_.createToken(address(this)));
        state = State.ACTIVE;

        emit ProgramCreated(name_, address(token), lockDistributions_);
    }

    /// @notice Define a new ERC-1155 token type on the program's token contract.
    /// @param name_         Display name (e.g. "Food Voucher")
    /// @param symbol_       Short symbol (e.g. "FOOD")
    /// @param maxSupply_    0 = unlimited (fungible), 1 = unique NFT, N = capped (badges/tickets)
    /// @param uri_          Optional per-type metadata URI
    /// @param transferable_ Whether holders can transfer tokens
    /// @param burnable_     Whether holders can burn tokens
    function defineTokenType(
        string calldata name_,
        string calldata symbol_,
        uint256 maxSupply_,
        string calldata uri_,
        bool transferable_,
        bool burnable_
    ) external onlyOwner returns (uint256 tokenId) {
        if (state != State.ACTIVE) revert ProgramNotActive();
        tokenId = token.defineTokenType(name_, symbol_, maxSupply_, uri_, transferable_, burnable_);
        emit TokenTypeDefined(tokenId, name_, symbol_, maxSupply_, transferable_, burnable_);
    }

    /// @notice Deploy and attach a CGCrowdfunding.
    function setCrowdfunding(uint256 target_, uint256 deadline_) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (address(crowdfunding) != address(0)) revert CrowdfundingAlreadySet();

        crowdfunding = CGCrowdfunding(componentFactory.createCrowdfunding(address(this), target_, deadline_));
        emit CrowdfundingSet(address(crowdfunding));
    }

    /// @notice Deploy a new CGDistribution for a specific token type.
    /// @param tokenId_ The ERC-1155 token type to distribute (must be defined on the CGToken).
    function createDistribution(uint256 tokenId_) external onlyOwner returns (address) {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (lockDistributions && _crowdfundingHasContributions()) revert DistributionsLocked();

        // Validate the token type exists
        token.getTokenType(tokenId_);

        CGDistribution dist = CGDistribution(
            componentFactory.createDistribution(address(this), IERC1155(address(token)), tokenId_)
        );
        distributions.push(dist);

        // Allow the distribution contract to transfer soulbound tokens on behalf of the program.
        token.setAuthorizedTransferrer(address(dist), true);

        uint256 index = distributions.length - 1;
        emit DistributionCreated(index, address(dist), tokenId_);
        return address(dist);
    }

    /// @notice Proxy call to set beneficiaries on a distribution.
    function setBeneficiaries(
        uint256 distributionIndex,
        address[] calldata beneficiaries_,
        uint256[] calldata amounts_
    ) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (lockDistributions && _crowdfundingHasContributions()) revert DistributionsLocked();

        CGDistribution dist = distributions[distributionIndex];
        dist.setBeneficiaries(beneficiaries_, amounts_);
        _validateSupplyCap(dist.tokenId());
    }

    /// @notice Proxy call to append beneficiaries to a distribution.
    function addBeneficiaries(
        uint256 distributionIndex,
        address[] calldata beneficiaries_,
        uint256[] calldata amounts_
    ) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (lockDistributions && _crowdfundingHasContributions()) revert DistributionsLocked();

        CGDistribution dist = distributions[distributionIndex];
        dist.addBeneficiaries(beneficiaries_, amounts_);
        _validateSupplyCap(dist.tokenId());
    }

    /// @notice Proxy call to remove beneficiaries from a distribution.
    function removeBeneficiaries(uint256 distributionIndex, address[] calldata toRemove_) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (lockDistributions && _crowdfundingHasContributions()) revert DistributionsLocked();

        distributions[distributionIndex].removeBeneficiaries(toRemove_);
    }

    /// @notice Permanently remove a distribution. DRAFT can always be deleted; READY requires no contributions.
    ///         Uses swap-and-pop so the last distribution takes the deleted slot.
    function deleteDistribution(uint256 distributionIndex) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        CGDistribution.State distState = distributions[distributionIndex].state();
        if (distState == CGDistribution.State.DISTRIBUTED) revert DistributionAlreadyDistributed(distributionIndex);
        if (distState == CGDistribution.State.READY && _crowdfundingHasContributions()) revert ContributionsExist();

        address deleted = address(distributions[distributionIndex]);

        // Revoke the distribution's ability to bypass soulbound restrictions
        token.setAuthorizedTransferrer(deleted, false);

        uint256 last = distributions.length - 1;
        if (distributionIndex != last) {
            distributions[distributionIndex] = distributions[last];
        }
        distributions.pop();

        emit DistributionDeleted(distributionIndex, deleted);
    }

    /// @notice Mint ERC-1155 tokens to a distribution and mark it READY.
    function markDistributionReady(uint256 distributionIndex) external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();

        CGDistribution dist = distributions[distributionIndex];
        uint256 required = dist.totalRequired();
        uint256 distTokenId = dist.tokenId();

        token.mint(address(dist), distTokenId, required);
        dist.markReady();
    }

    /// @notice Accept ETH contributions. Enforces the lock-distributions rule.
    function contribute() external payable {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (address(crowdfunding) == address(0)) revert NoCrowdfunding();

        if (lockDistributions) {
            if (distributions.length == 0) revert NoDistributions();
            for (uint256 i = 0; i < distributions.length; i++) {
                if (distributions[i].state() != CGDistribution.State.READY) revert DistributionNotReady(i);
            }
        }

        crowdfunding.contributeFor{ value: msg.value }(msg.sender);
    }

    /// @notice Withdraw funds and distribute tokens — all in one transaction.
    function execute() external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();
        if (address(crowdfunding) == address(0)) revert NoCrowdfunding();
        if (distributions.length == 0) revert NoDistributions();

        if (crowdfunding.state() != CGCrowdfunding.State.FUNDED) revert CrowdfundingNotFunded();

        for (uint256 i = 0; i < distributions.length; i++) {
            if (distributions[i].state() != CGDistribution.State.READY) revert DistributionNotReady(i);
        }

        // Act as a reentrancy guard: external calls below (withdraw, distribute)
        // will revert if they re-enter any function guarded by `ProgramNotActive`.
        state = State.EXECUTING;

        crowdfunding.withdraw(owner());

        for (uint256 i = 0; i < distributions.length; i++) {
            distributions[i].distribute();
        }

        state = State.COMPLETED;
        emit ProgramExecuted();
    }

    /// @notice Cancel program and crowdfunding.
    function cancel() external onlyOwner {
        if (state != State.ACTIVE) revert ProgramNotActive();

        state = State.CANCELLED;

        if (
            address(crowdfunding) != address(0) &&
            (crowdfunding.state() == CGCrowdfunding.State.UNFUNDED ||
                crowdfunding.state() == CGCrowdfunding.State.FUNDED)
        ) {
            crowdfunding.cancel();
        }

        emit ProgramCancelled();
    }

    function distributionCount() external view returns (uint256) {
        return distributions.length;
    }

    /// @notice Return info for all defined token types.
    function getTokenTypes() external view returns (TokenTypeInfo[] memory infos) {
        uint256 count = token.nextTokenId();
        infos = new TokenTypeInfo[](count);
        for (uint256 i = 0; i < count; i++) {
            CGToken.TokenType memory tt = token.getTokenType(i);
            infos[i] = TokenTypeInfo({
                tokenId: i,
                name: tt.name,
                symbol: tt.symbol,
                maxSupply: tt.maxSupply,
                totalMinted: tt.totalMinted,
                uri: token.uri(i),
                transferable: tt.transferable,
                burnable: tt.burnable
            });
        }
    }

    /// @notice Return all crowdfunding info in a single call.
    function getCrowdfundingInfo() external view returns (CrowdfundingInfo memory info) {
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
    function getDistributionInfo(uint256 index) public view returns (DistributionInfo memory) {
        CGDistribution dist = distributions[index];
        return
            DistributionInfo({
                addr: address(dist),
                tokenId: dist.tokenId(),
                state: dist.state(),
                beneficiaryCount: dist.beneficiaryCount(),
                totalRequired: dist.totalRequired(),
                beneficiaries: dist.getBeneficiaries(),
                amounts: dist.getAmounts()
            });
    }

    /// @notice Return info for all distributions.
    function getAllDistributionsInfo() external view returns (DistributionInfo[] memory infos) {
        infos = new DistributionInfo[](distributions.length);
        for (uint256 i = 0; i < distributions.length; i++) {
            infos[i] = getDistributionInfo(i);
        }
    }

    /// @dev Reverts if aggregate token requirements across all distributions exceed maxSupply.
    function _validateSupplyCap(uint256 distTokenId_) internal view {
        CGToken.TokenType memory tt = token.getTokenType(distTokenId_);
        if (tt.maxSupply > 0) {
            uint256 aggregateRequired = _totalRequiredForToken(distTokenId_);
            if (aggregateRequired > tt.maxSupply)
                revert ExceedsTotalSupply(distTokenId_, aggregateRequired, tt.maxSupply);
        }
    }

    function _crowdfundingHasContributions() internal view returns (bool) {
        return address(crowdfunding) != address(0) && crowdfunding.totalRaised() > 0;
    }

    /// @dev Sum totalRequired across all distributions targeting the same token type.
    function _totalRequiredForToken(uint256 tokenId_) internal view returns (uint256 total) {
        for (uint256 i = 0; i < distributions.length; i++) {
            CGDistribution dist = distributions[i];
            if (dist.tokenId() == tokenId_) {
                total += dist.totalRequired();
            }
        }
    }
}
