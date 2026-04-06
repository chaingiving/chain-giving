// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockEntryPoint — Minimal ERC-4337 EntryPoint for testing CGPaymaster
/// @dev Accepts ETH deposits and forwards withdrawals. Not for production use.
contract MockEntryPoint {
    struct DepositInfo {
        uint112 deposit;
        bool staked;
        uint112 stake;
        uint32 unstakeDelaySec;
        uint48 withdrawTime;
    }

    receive() external payable {}

    /// @dev Accept ETH on behalf of a paymaster (funds stay in this contract).
    function depositTo(address) external payable {}

    /// @dev Forward ETH to the requested address.
    function withdrawTo(address payable to, uint256 amount) external {
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "MockEntryPoint: transfer failed");
    }

    /// @dev Report total ETH held (shared pool, sufficient for unit tests).
    function balanceOf(address) external view returns (uint256) {
        return address(this).balance;
    }

    function getDepositInfo(address) external view returns (DepositInfo memory info) {
        info.deposit = uint112(address(this).balance);
    }
}
