import { Address } from "viem";
import { useWriteContract } from "wagmi";
import { cgTokenAbi } from "~~/contracts/cgTokenAbi";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

export function useCGTokenWrite(tokenAddress: Address) {
  const { writeContractAsync } = useWriteContract();
  const writeTx = useTransactor();

  return async (functionName: string, args: readonly unknown[]) => {
    try {
      await writeTx(() =>
        writeContractAsync({
          address: tokenAddress,
          abi: cgTokenAbi,
          functionName: functionName as any,
          args: args as any,
        } as any),
      );
      return true;
    } catch (e) {
      notification.error(getParsedError(e));
      return false;
    }
  };
}
