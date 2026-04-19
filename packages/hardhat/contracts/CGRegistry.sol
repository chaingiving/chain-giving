// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CGOrganization } from "./CGOrganization.sol";
import { CGProgramFactory } from "./CGProgramFactory.sol";

/// @title CGRegistry — Directory of all CGOrganization instances
/// @notice Only the registry owner (deployer) can create organizations.
contract CGRegistry is Ownable {
    CGProgramFactory public immutable programFactory;
    address[] public organizations;
    mapping(address => bool) public isOrganization;

    event OrganizationCreated(address indexed organization, address indexed owner, string name);
    event OrganizationAdded(address indexed organization);
    event OrganizationRemoved(address indexed organization);

    error EmptyName();
    error ZeroAddress();
    error NotOrganization();
    error AlreadyOrganization();

    constructor(CGProgramFactory programFactory_) Ownable(msg.sender) {
        programFactory = programFactory_;
    }

    /// @notice Deploy a new CGOrganization with the given owner. Only callable by registry owner.
    function createOrganization(string calldata name_, address owner_) external onlyOwner returns (address) {
        if (bytes(name_).length == 0) revert EmptyName();
        if (owner_ == address(0)) revert ZeroAddress();

        CGOrganization org = new CGOrganization(owner_, name_, programFactory);
        address addr = address(org);
        organizations.push(addr);
        isOrganization[addr] = true;

        // Authorize the new organization to use the factory
        programFactory.authorizeCaller(addr, true);

        emit OrganizationCreated(addr, owner_, name_);
        return addr;
    }

    /// @notice Add an existing CGOrganization by address (e.g. to re-add a previously removed org).
    ///         Only callable by registry owner. Re-authorizes the org to use the program factory.
    function addOrganization(address organization_) external onlyOwner {
        if (organization_ == address(0)) revert ZeroAddress();
        if (isOrganization[organization_]) revert AlreadyOrganization();

        organizations.push(organization_);
        isOrganization[organization_] = true;
        programFactory.authorizeCaller(organization_, true);

        emit OrganizationAdded(organization_);
    }

    /// @notice Remove an organization from the registry. Only callable by registry owner.
    /// @dev Revokes the organization's authorization to use the program factory. Does not
    ///      affect already-deployed programs owned by that organization.
    function removeOrganization(address organization_) external onlyOwner {
        if (!isOrganization[organization_]) revert NotOrganization();

        uint256 len = organizations.length;
        for (uint256 i = 0; i < len; i++) {
            if (organizations[i] == organization_) {
                if (i != len - 1) organizations[i] = organizations[len - 1];
                organizations.pop();
                break;
            }
        }

        delete isOrganization[organization_];
        programFactory.authorizeCaller(organization_, false);

        emit OrganizationRemoved(organization_);
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
