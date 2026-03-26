import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployCGProgram: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  await deploy("CGProgram", {
    from: deployer,
    args: [
      deployer,
      "Demo Program",
      true, // lockDistributions
    ],
    log: true,
    autoMine: true,
  });

  // Define a default fungible token type (unlimited supply)
  await execute("CGProgram", { from: deployer, log: true }, "defineTokenType", "Food Voucher", "FOOD", 0, "");
};

export default deployCGProgram;

deployCGProgram.tags = ["CGProgram"];
