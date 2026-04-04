import { useTargetNetwork } from "./useTargetNetwork";
import { Address } from "viem";
import { hardhat } from "viem/chains";

export function useBlockExplorerLink(address: Address | undefined) {
  const { targetNetwork } = useTargetNetwork();
  if (!address || targetNetwork.id !== hardhat.id) return undefined;
  return `/blockexplorer/address/${address}`;
}
