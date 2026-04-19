import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployCGRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, read, getOrNull } = hre.deployments;

  // Deploy the unified component factory used by CGProgram
  const componentFactory = await deploy("CGComponentFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  // CGProgramFactory must end up owned by the current CGRegistry. If it's currently owned
  // by neither the deployer (pre-transfer state) nor the currently-recorded CGRegistry
  // (stable post-transfer state), it's stuck under an older registry — drop the record and
  // redeploy. The factory has no state worth preserving.
  const existingFactory = await getOrNull("CGProgramFactory");
  if (existingFactory) {
    const factoryOwner: string = await read("CGProgramFactory", "owner");
    const existingRegistry = await getOrNull("CGRegistry");
    const isDeployerOwned = factoryOwner.toLowerCase() === deployer.toLowerCase();
    const isCurrentRegistryOwned =
      existingRegistry && factoryOwner.toLowerCase() === existingRegistry.address.toLowerCase();
    if (!isDeployerOwned && !isCurrentRegistryOwned) {
      await hre.deployments.delete("CGProgramFactory");
    }
  }

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

  // Transfer factory ownership to registry so it can authorize new organizations.
  // Skip if already owned (e.g. a prior run landed this tx but lost track of it).
  const currentFactoryOwner: string = await read("CGProgramFactory", "owner");
  if (currentFactoryOwner.toLowerCase() !== registry.address.toLowerCase()) {
    await execute(
      "CGProgramFactory",
      { from: deployer, log: true, autoMine: true },
      "transferOwnership",
      registry.address,
    );
  }
};

export default deployCGRegistry;

deployCGRegistry.tags = ["CGRegistry", "CGProgramFactory", "CGComponentFactory"];
