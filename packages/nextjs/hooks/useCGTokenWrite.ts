import { Address } from "viem";
import { cgTokenAbi } from "~~/contracts/cgTokenAbi";
import { useSponsoredWrite } from "~~/hooks/useSponsoredWrite";

export function useCGTokenWrite(tokenAddress: Address, orgAddress?: Address) {
  const { write: sponsoredWrite } = useSponsoredWrite(orgAddress);

  return async (functionName: string, args: readonly unknown[]) => {
    return sponsoredWrite({
      address: tokenAddress,
      abi: cgTokenAbi,
      functionName,
      args,
    });
  };
}
