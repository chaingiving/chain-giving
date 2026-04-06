import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

// ERC-4337 EntryPoint v0.6 — deterministically deployed at the same address on all EVM chains.
const ENTRY_POINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

// Emit a LowBalance event when an org's gas stash falls below 0.01 ETH.
const LOW_BALANCE_THRESHOLD = ethers.parseEther("0.01");

const deployCGPaymaster: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const registry = await hre.deployments.get("CGRegistry");

  // On a local Hardhat network there is no live EntryPoint, so we deploy MockEntryPoint instead.
  let entryPointAddress: string;
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    const mockEntryPoint = await deploy("MockEntryPoint", {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    });
    entryPointAddress = mockEntryPoint.address;
  } else {
    entryPointAddress = ENTRY_POINT_V06;
  }

  await deploy("CGPaymaster", {
    from: deployer,
    args: [entryPointAddress, registry.address, LOW_BALANCE_THRESHOLD],
    log: true,
    autoMine: true,
  });
};

export default deployCGPaymaster;

deployCGPaymaster.tags = ["CGPaymaster"];
deployCGPaymaster.dependencies = ["CGRegistry"];
