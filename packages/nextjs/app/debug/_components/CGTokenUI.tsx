"use client";

import { Contract } from "@scaffold-ui/debug-contracts";
import { cgTokenAbi } from "~~/contracts/cgTokenAbi";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";

export const CG_TOKEN_CONTRACT_NAME = "CGToken" as const;

export const CGTokenUI = () => {
  const { targetNetwork } = useTargetNetwork();
  const { data: tokenAddress, isLoading } = useScaffoldReadContract({
    contractName: "CGProgram",
    functionName: "token",
  });

  if (isLoading) {
    return (
      <div className="mt-14">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!tokenAddress) {
    return (
      <div className="alert alert-error mt-14">
        <span>Could not resolve CGToken address from CGProgram</span>
      </div>
    );
  }

  return (
    <Contract
      contractName={CG_TOKEN_CONTRACT_NAME}
      contract={{ address: tokenAddress, abi: cgTokenAbi }}
      chainId={targetNetwork.id}
    />
  );
};
