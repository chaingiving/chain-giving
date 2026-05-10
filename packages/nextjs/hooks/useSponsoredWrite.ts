import { Abi, Address, encodeFunctionData } from "viem";
import { useAccount, useSendCalls, useWriteContract } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { useOrgGasSponsorship } from "~~/hooks/useOrgGasSponsorship";
import scaffoldConfig from "~~/scaffold.config";
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
  const {
    isSponsorshipAvailable,
    isPaymasterSupported,
    hasBudget,
    orgBalance,
    orgBalanceFormatted,
    isEIP5792Wallet,
    isOpenfortEmbedded,
  } = useOrgGasSponsorship(orgAddress);

  const { sendCallsAsync } = useSendCalls();
  const { writeContractAsync } = useWriteContract();
  const writeTx = useTransactor();

  const write = async (call: ContractCall): Promise<boolean> => {
    try {
      if (isSponsorshipAvailable && orgAddress) {
        // Two paymasterService shapes — Openfort embedded wallet's bundler reads
        // `policy` (a pol_…), every other EIP-5792 wallet reads `url` + `context`.
        // Both ultimately route to /api/paymaster; the route covers both shapes
        // (Openfort calls server-side without context, so the route extracts
        // orgAddress from the userOp callData).
        const paymasterService = isOpenfortEmbedded
          ? { policy: scaffoldConfig.openfortFeeSponsorshipId }
          : {
              url: `${window.location.origin}/api/paymaster`,
              context: { orgAddress },
            };

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
          capabilities: { paymasterService },
          chainId,
        } as any);

        notification.success("Transaction sponsored by organization gas budget");
        return true;
      }

      // Fallback: regular writeContract via useTransactor (handles notifications)
      await writeTx(() =>
        writeContractAsync({
          address: call.address,
          abi: call.abi as Abi,
          functionName: call.functionName as any,
          args: call.args as any,
          value: call.value as any,
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
