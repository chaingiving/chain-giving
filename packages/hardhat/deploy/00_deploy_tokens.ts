import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

// 1,000,000 units in 6-decimal token (= $1M / €1M of test funds per signer).
const SEED_AMOUNT = 1_000_000_000_000n;

const deployMockTokens: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") return;

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const usdc = await deploy("MockUSDC", { from: deployer, args: [], log: true, autoMine: true });
  const eurc = await deploy("MockEURC", { from: deployer, args: [], log: true, autoMine: true });

  // Mint test balances to the first 5 signers so local frontends see funded wallets.
  const signers = await ethers.getSigners();
  const recipients = signers.slice(0, 5).map(s => s.address);

  const usdcContract = await ethers.getContractAt("MockUSDC", usdc.address);
  const eurcContract = await ethers.getContractAt("MockEURC", eurc.address);

  for (const to of recipients) {
    if ((await usdcContract.balanceOf(to)) === 0n) await (await usdcContract.mint(to, SEED_AMOUNT)).wait();
    if ((await eurcContract.balanceOf(to)) === 0n) await (await eurcContract.mint(to, SEED_AMOUNT)).wait();
  }
};

export default deployMockTokens;

deployMockTokens.tags = ["MockTokens", "MockUSDC", "MockEURC"];
