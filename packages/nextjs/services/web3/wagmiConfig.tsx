import { wagmiConnectors } from "./wagmiConnectors";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { Chain, fallback, http } from "viem";
import { mainnet } from "viem/chains";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

// Build per-chain transports with the same RPC fallback logic as before.
const transports = Object.fromEntries(
  enabledChains.map(chain => {
    const mainnetFallback = chain.id === mainnet.id ? [http("https://mainnet.rpc.buidlguidl.com")] : [];
    let rpcFallbacks = [...mainnetFallback, http()];
    const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
    if (rpcOverrideUrl) {
      rpcFallbacks = [http(rpcOverrideUrl), ...rpcFallbacks];
    } else {
      const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
      if (alchemyHttpUrl) {
        const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
        rpcFallbacks = isUsingDefaultKey
          ? [...rpcFallbacks, http(alchemyHttpUrl)]
          : [http(alchemyHttpUrl), ...rpcFallbacks];
      }
    }
    return [chain.id, fallback(rpcFallbacks)];
  }),
);

// WagmiAdapter replaces createConfig and adds Reown's embedded wallet connector.
// The RainbowKit connectors are passed through so MetaMask, Ledger, Safe, etc. still work.
const wagmiAdapter = new WagmiAdapter({
  networks: enabledChains as any,
  projectId: scaffoldConfig.walletConnectProjectId,
  ssr: true,
  transports,
  pollingInterval: scaffoldConfig.pollingInterval,
  connectors: wagmiConnectors(),
});

// createAppKit must run at module load on both server and client: it finishes
// wiring the WagmiAdapter (connectors, embedded-wallet provider, connector
// state). Without it, wagmiAdapter.wagmiConfig is half-initialized and any
// downstream useConfig() throws WagmiProviderNotFoundError. The adapter has
// ssr: true to make this safe outside the browser.
createAppKit({
  adapters: [wagmiAdapter],
  projectId: scaffoldConfig.walletConnectProjectId,
  networks: enabledChains as any,
  /* Note Features are overwritten by those set on dashboard.reown.com
  features: {
    email: true,
    socials: ["google", "apple", "github", "discord", "facebook"],
    emailShowWallets: false,
  },
  */
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
