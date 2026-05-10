import { Address, formatEther } from "viem";
import { useAccount, useCapabilities, useReadContract } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";

// Openfort embedded wallet connector id (see @openfort/react/wagmi).
// Openfort's wallet_sendCalls only honors `capabilities.paymasterService.policy`
// (their dashboard pol_… IDs), NOT the standard ERC-7677 url+context shape that
// CGPaymaster speaks. Treat the embedded wallet as paymaster-unsupported so
// useSponsoredWrite falls back to a plain writeContract instead of producing
// silently-broken UserOps.
const OPENFORT_EMBEDDED_CONNECTOR_ID = "xyz.openfort";

/**
 * Reads gas sponsorship state for an organization from CGPaymaster,
 * and detects whether the connected wallet supports EIP-5792 paymasterService.
 */
export function useOrgGasSponsorship(orgAddress: Address | undefined) {
  const { address: connectedAddress, chainId, connector } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: paymasterInfo } = useDeployedContractInfo({ contractName: "CGPaymaster" });

  // Read org balance from CGPaymaster
  const { data: orgBalance, isLoading: balanceLoading } = useReadContract({
    address: paymasterInfo?.address,
    abi: paymasterInfo?.abi,
    functionName: "orgBalance",
    args: orgAddress ? [orgAddress] : undefined,
    query: {
      enabled: !!paymasterInfo?.address && !!orgAddress,
      refetchInterval: 10000,
    },
  });

  // Read org manager
  const { data: orgManager } = useReadContract({
    address: paymasterInfo?.address,
    abi: paymasterInfo?.abi,
    functionName: "managerOf",
    args: orgAddress ? [orgAddress] : undefined,
    query: {
      enabled: !!paymasterInfo?.address && !!orgAddress,
      refetchInterval: 30000,
    },
  });

  // Detect wallet EIP-5792 capabilities
  const { data: walletCapabilities, isSuccess: isEIP5792Wallet } = useCapabilities({
    account: connectedAddress,
  });

  const currentChainId = chainId ?? targetNetwork.id;
  const chainCapabilities = walletCapabilities?.[currentChainId];
  const isOpenfortEmbedded = connector?.id === OPENFORT_EMBEDDED_CONNECTOR_ID;
  const isPaymasterSupported = !!chainCapabilities?.paymasterService?.supported && !isOpenfortEmbedded;

  // Gas sponsorship is available when:
  // 1. CGPaymaster is deployed
  // 2. The org has a positive gas budget
  // 3. The wallet supports paymasterService capability
  // 4. The page is served over HTTPS (wallets reject http:// paymaster URLs)
  const balance = orgBalance as bigint | undefined;
  const hasBudget = balance !== undefined && balance > 0n;
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const isSponsorshipAvailable = !!paymasterInfo?.address && hasBudget && isPaymasterSupported && isHttps;

  return {
    /** CGPaymaster contract address */
    paymasterAddress: paymasterInfo?.address,
    /** Org's remaining gas budget in wei */
    orgBalance: balance,
    /** Formatted gas budget for display */
    orgBalanceFormatted: balance !== undefined ? formatEther(balance) : undefined,
    /** Whether the org has a positive gas budget */
    hasBudget,
    /** Current org manager address */
    orgManager: orgManager as Address | undefined,
    /** Whether the connected wallet supports EIP-5792 */
    isEIP5792Wallet,
    /** Whether the wallet supports paymasterService on this chain */
    isPaymasterSupported,
    /** Whether gas sponsorship is fully available (budget + wallet support) */
    isSponsorshipAvailable,
    /** Loading state */
    isLoading: balanceLoading,
  };
}
