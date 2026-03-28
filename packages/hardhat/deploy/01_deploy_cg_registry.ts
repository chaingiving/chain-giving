import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployCGRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  // Deploy the unified component factory used by CGProgram
  const componentFactory = await deploy("CGComponentFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  // Deploy CGProgramFactory with the component factory
  const programFactory = await deploy("CGProgramFactory", {
    from: deployer,
    args: [componentFactory.address],
    log: true,
    autoMine: true,
  });

  const registry = await deploy("CGRegistry", {
    from: deployer,
    args: [programFactory.address],
    log: true,
    autoMine: true,
  });

  // Transfer factory ownership to registry so it can authorize new organizations
  await execute(
    "CGProgramFactory",
    { from: deployer, log: true, autoMine: true },
    "transferOwnership",
    registry.address,
  );
};

export default deployCGRegistry;

deployCGRegistry.tags = ["CGRegistry", "CGProgramFactory", "CGComponentFactory"];
