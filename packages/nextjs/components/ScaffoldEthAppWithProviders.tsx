"use client";

import { AccountTypeEnum, AuthProvider, OpenfortProvider, RecoveryMethod } from "@openfort/react";
import { OpenfortWagmiBridge } from "@openfort/react/wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { enabledChains, wagmiConfig } from "~~/services/web3/wagmiConfig";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

// Openfort's embedded wallet ships its own ethers v5 RPC provider that, by
// default, uses each chain's public RPC (e.g. https://sepolia.base.org). Those
// are flaky — eth_getTransactionCount routinely 503s. Hand Openfort the same
// Alchemy URLs we already use for wagmi so its internal calls go through a
// reliable RPC. Keys whose lookup yields no Alchemy URL are simply omitted;
// Openfort then falls back to its default for those chains.
const openfortRpcUrls = Object.fromEntries(
  enabledChains.flatMap(chain => {
    const url = getAlchemyHttpUrl(chain.id);
    return url ? [[chain.id, url] as const] : [];
  }),
);

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <OpenfortWagmiBridge>
          <OpenfortProvider
            publishableKey={scaffoldConfig.openfortPublishableKey}
            walletConfig={{
              shieldPublishableKey: scaffoldConfig.openfortShieldPublishableKey,
              ethereum: {
                rpcUrls: openfortRpcUrls,
                // Smart account is required for our 4337 paymaster integration: an EOA
                // can't have its UserOps sponsored. The CGPaymaster sponsorship policy
                // (NEXT_PUBLIC_OPENFORT_FEE_SPONSORSHIP_ID) is only honored when the
                // wallet is a smart account.
                accountType: AccountTypeEnum.SMART_ACCOUNT,
                ethereumFeeSponsorshipId: scaffoldConfig.openfortFeeSponsorshipId || undefined,
              },
              createEncryptedSessionEndpoint: "/api/openfort/encryption-session",
              connectOnLogin: true,
            }}
            uiConfig={{
              theme: "auto",
              mode: isDarkMode ? "dark" : "light",
              authProviders: [AuthProvider.EMAIL_OTP, AuthProvider.GUEST],
              walletRecovery: {
                // Automatic — recovery share is fetched server-side via
                // /api/openfort/encryption-session. No user prompt, survives
                // local-storage clears.
                allowedMethods: [RecoveryMethod.AUTOMATIC],
                defaultMethod: RecoveryMethod.AUTOMATIC,
              },
            }}
          >
            <RainbowKitProvider avatar={BlockieAvatar} theme={isDarkMode ? darkTheme() : lightTheme()}>
              <ProgressBar height="3px" color="#2299dd" />
              <ScaffoldEthApp>{children}</ScaffoldEthApp>
            </RainbowKitProvider>
          </OpenfortProvider>
        </OpenfortWagmiBridge>
      </WagmiProvider>
    </QueryClientProvider>
  );
};
