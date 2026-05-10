import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  burnerWalletMode: "localNetworksOnly" | "allNetworks" | "disabled";
  openfortPublishableKey: string;
  openfortShieldPublishableKey: string;
  openfortFeeSponsorshipId: string;
};

export type ScaffoldConfig = BaseConfig;

export const DEFAULT_ALCHEMY_API_KEY = "cR4WnXePioePZ5fFrnSiR";

const scaffoldConfig = {
  // The networks on which your DApp is live
  targetNetworks: [chains.baseSepolia, ...(process.env.NODE_ENV === "development" ? [chains.hardhat] : [])],
  // Drives wagmi's useBlockNumber polling, which in turn invalidates every
  // useScaffoldReadContract on each new block. Base Sepolia produces a block
  // every 2s, so a 3s interval used to fire ~1 contract re-read per useScaffoldRead*
  // hook per second of page time — enough to rate-limit a free Alchemy key on
  // a single page. 12s gives a worst-case ~12s staleness, which is fine for
  // every read this app makes (org/program metadata, balances, distribution
  // state). Writes still trigger an immediate refetch.
  pollingInterval: 12000,
  // This is ours Alchemy's default API key.
  // You can get your own at https://dashboard.alchemyapi.io
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,
  // If you want to use a different RPC for a specific network, you can add it here.
  // The key is the chain ID, and the value is the HTTP RPC URL
  rpcOverrides: {
    // Example:
    // [chains.mainnet.id]: "https://mainnet.rpc.buidlguidl.com",
  },
  // This is ours WalletConnect's default project ID.
  // You can get your own at https://cloud.walletconnect.com
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  // Default to Chain.Giving project ID
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "5a4882d8b717259a79ca0b5feb86e664",
  // Configure Burner Wallet visibility:
  // - "localNetworksOnly": only show when all target networks are local (hardhat/anvil)
  // - "allNetworks": show on any configured target networks
  // - "disabled": completely disable
  burnerWalletMode: "localNetworksOnly",
  // Openfort credentials, from https://dashboard.openfort.io
  openfortPublishableKey: process.env.NEXT_PUBLIC_OPENFORT_PUBLISHABLE_KEY || "",
  openfortShieldPublishableKey: process.env.NEXT_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY || "",
  // Openfort policy id (pol_…) linked to the registered CGPaymaster entity. Required for
  // sponsored writes from Openfort embedded wallets — they're 4337 smart accounts and
  // Openfort's bundler reads this via wallet_sendCalls.capabilities.paymasterService.policy.
  openfortFeeSponsorshipId: process.env.NEXT_PUBLIC_OPENFORT_FEE_SPONSORSHIP_ID || "",
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
