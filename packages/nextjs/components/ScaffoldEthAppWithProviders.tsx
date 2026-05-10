"use client";

import { AuthProvider, OpenfortProvider, RecoveryMethod } from "@openfort/react";
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
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

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
              ethereum: {},
              connectOnLogin: true,
            }}
            uiConfig={{
              theme: "auto",
              mode: isDarkMode ? "dark" : "light",
              authProviders: [AuthProvider.EMAIL_OTP, AuthProvider.GUEST],
              walletRecovery: {
                // Passkey disabled for now
                allowedMethods: [RecoveryMethod.PASSWORD],
                defaultMethod: RecoveryMethod.PASSWORD,
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
