import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployCGProgram: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("CGProgram", {
    from: deployer,
    args: [
      deployer,
      "Demo Program",
      "Food Voucher",
      "FOOD",
      false, // lockDistributions
    ],
    log: true,
    autoMine: true,
  });
};

export default deployCGProgram;

deployCGProgram.tags = ["CGProgram"];
