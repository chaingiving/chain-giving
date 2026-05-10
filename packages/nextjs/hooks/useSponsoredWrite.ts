import { Abi, Address, encodeFunctionData } from "viem";
import { useAccount, useSendCalls, useWriteContract } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { useOrgGasSponsorship } from "~~/hooks/useOrgGasSponsorship";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

type ContractCall = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Hook that provides a `write` function for sending contract calls with
 * automatic gas sponsorship via EIP-5792 + CGPaymaster when available,
 * falling back to a regular `writeContract` call otherwise.
 *
 * Usage:
 * ```ts
 * const { write, isSponsorshipAvailable } = useSponsoredWrite(orgAddress);
 * await write({ address, abi, functionName, args });
 * ```
 */
export function useSponsoredWrite(orgAddress: Address | undefined) {
  const { chainId } = useAccount();
  const { isSponsorshipAvailable, isPaymasterSupported, hasBudget, orgBalance, orgBalanceFormatted, isEIP5792Wallet } =
    useOrgGasSponsorship(orgAddress);

  const { sendCallsAsync } = useSendCalls();
  const { writeContractAsync } = useWriteContract();
  const writeTx = useTransactor();

  const write = async (call: ContractCall): Promise<boolean> => {
    try {
      if (isSponsorshipAvailable && orgAddress) {
        // Use EIP-5792 sendCalls with paymasterService capability
        const paymasterServiceUrl = `${window.location.origin}/api/paymaster`;

        await sendCallsAsync({
          calls: [
            {
              to: call.address,
              data: encodeFunctionData({
                abi: call.abi as Abi,
                functionName: call.functionName,
                args: call.args ?? [],
              }),
              value: call.value,
            },
          ],
          capabilities: {
            paymasterService: {
              url: paymasterServiceUrl,
              context: { orgAddress },
            },
          },
          chainId,
        } as any);

        notification.success("Transaction sponsored by organization gas budget");
        return true;
      }

      // Fallback: regular writeContract via useTransactor (handles notifications).
      // chainId is passed explicitly so wagmi resolves the chain from wagmiConfig
      // rather than the wallet client — Reown AppKit's adapter can leak the CAIP-2
      // form ("eip155:84532") which then blows up in viem's BigInt(chainId) path.
      await writeTx(() =>
        writeContractAsync({
          address: call.address,
          abi: call.abi as Abi,
          functionName: call.functionName as any,
          args: call.args as any,
          value: call.value as any,
          chainId,
        } as any),
      );
      return true;
    } catch (e) {
      const errorMessage = getParsedError(e);
      notification.error(errorMessage);
      return false;
    }
  };

  return {
    write,
    isSponsorshipAvailable,
    isPaymasterSupported,
    hasBudget,
    isEIP5792Wallet,
    orgBalance,
    orgBalanceFormatted,
  };
}
