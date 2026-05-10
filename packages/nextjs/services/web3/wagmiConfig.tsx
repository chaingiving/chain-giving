import { wagmiConnectors } from "./wagmiConnectors";
import { embeddedWalletConnector, getDefaultConfig } from "@openfort/react/wagmi";
import { Chain, fallback, http } from "viem";
import { base, baseSepolia, mainnet, optimism, optimismSepolia, sepolia } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

// Known-healthy public RPCs per chain. Used as a middle-tier fallback so a
// rate-limited Alchemy key (429) doesn't cascade all the way to the chain's
// default public RPC, which on Base Sepolia is sepolia.base.org and 503s
// under any real load.
const PUBLIC_FALLBACK_RPCS: Record<number, readonly string[]> = {
  [mainnet.id]: ["https://mainnet.rpc.buidlguidl.com", "https://ethereum-rpc.publicnode.com"],
  [sepolia.id]: ["https://ethereum-sepolia-rpc.publicnode.com"],
  [base.id]: ["https://base-rpc.publicnode.com"],
  [baseSepolia.id]: ["https://base-sepolia-rpc.publicnode.com"],
  [optimism.id]: ["https://optimism-rpc.publicnode.com"],
  [optimismSepolia.id]: ["https://optimism-sepolia-rpc.publicnode.com"],
};

// RPC priority: rpcOverride → Alchemy → known-healthy public node → chain default.
// The chain default (e.g. sepolia.base.org) is the last-resort because it 503s
// under any real load. Without the publicnode middle tier, a 429 from Alchemy
// dropped us straight to that broken default.
const transports = Object.fromEntries(
  enabledChains.map(chain => {
    const ordered = [];
    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) ordered.push(http(rpcOverrideUrl));
    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    if (alchemyHttpUrl) ordered.push(http(alchemyHttpUrl));
    for (const url of PUBLIC_FALLBACK_RPCS[chain.id] ?? []) ordered.push(http(url));
    ordered.push(http()); // chain-default public RPC, last-resort
    return [chain.id, fallback(ordered)];
  }),
);

// We hand-build the connector list rather than letting Openfort's getDefaultConfig
// supply its own. We want:
//   1. Openfort embedded wallet (for the "Sign in" feature — email/social → smart account)
//   2. RainbowKit's wallet set (MetaMask, WalletConnect, Ledger, …) for "Connect Wallet"
// getDefaultConfig keeps any explicit `connectors` prop verbatim, so we MUST include
// embeddedWalletConnector() ourselves — the OpenfortWagmiBridge looks for it by id.
export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: "Chain.Giving",
    chains: enabledChains as any,
    walletConnectProjectId: scaffoldConfig.walletConnectProjectId,
    transports,
    pollingInterval: scaffoldConfig.pollingInterval,
    ssr: true,
    connectors: [embeddedWalletConnector(), ...wagmiConnectors()],
  }),
);
