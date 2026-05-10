import { wagmiConnectors } from "./wagmiConnectors";
import { embeddedWalletConnector, getDefaultConfig } from "@openfort/react/wagmi";
import { Chain, fallback, http } from "viem";
import { mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

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
