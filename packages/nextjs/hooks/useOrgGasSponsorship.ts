import { Address, formatEther } from "viem";
import { useAccount, useCapabilities, useReadContract } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";

// Openfort embedded wallet connector id (see @openfort/react/wagmi).
// Two-track sponsorship:
//  - External wallets (Coinbase Smart Wallet, MetaMask Smart, …) speak ERC-7677
//    so we pass the CGPaymaster URL via paymasterService.url + context.
//  - Openfort embedded wallets are 4337 smart accounts whose wallet_sendCalls
//    routes through Openfort's bundler. Openfort only reads
//    capabilities.paymasterService.policy (a pol_…). The policy is created in
//    the Openfort dashboard and points back at our CGPaymaster URL.
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
  const hasOpenfortPolicy = !!scaffoldConfig.openfortFeeSponsorshipId;
  // External wallets: rely on EIP-5792 paymasterService capability discovery.
  // Openfort embedded: capability is reported but the wallet only honors a policy id,
  // so we gate on the configured policy instead.
  const isPaymasterSupported = isOpenfortEmbedded
    ? hasOpenfortPolicy
    : !!chainCapabilities?.paymasterService?.supported;

  // Gas sponsorship is available when:
  // 1. CGPaymaster is deployed
  // 2. The org has a positive gas budget
  // 3. The wallet supports paymasterService capability (or has an Openfort policy)
  // 4. For external wallets: the page is served over HTTPS (they reject http:// paymaster URLs).
  //    Openfort doesn't apply this rule because its bundler — not the wallet — calls our URL.
  const balance = orgBalance as bigint | undefined;
  const hasBudget = balance !== undefined && balance > 0n;
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const httpsOk = isOpenfortEmbedded || isHttps;
  const isSponsorshipAvailable = !!paymasterInfo?.address && hasBudget && isPaymasterSupported && httpsOk;

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
    /** True when the connected wallet is the Openfort embedded smart account. */
    isOpenfortEmbedded,
    /** Loading state */
    isLoading: balanceLoading,
  };
}
