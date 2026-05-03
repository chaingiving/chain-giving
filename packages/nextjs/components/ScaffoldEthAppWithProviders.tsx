"use client";

import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { enabledChains, wagmiAdapter, wagmiConfig } from "~~/services/web3/wagmiConfig";

// Silence Lit dev-mode warning emitted from @reown/appkit's web components.
// Must run before any Lit element loads.
if (typeof globalThis !== "undefined") {
  const g = globalThis as typeof globalThis & { litIssuedWarnings?: Set<string> };
  g.litIssuedWarnings ??= new Set();
  g.litIssuedWarnings.add("dev-mode");
}

// Per Reown's Next.js setup, createAppKit must run from a Client Component file
// so its Lit-based modal web components are only constructed on the client. It
// also finishes wiring the WagmiAdapter so wagmiConfig is fully initialised
// before any downstream useConfig() runs.
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider avatar={BlockieAvatar} theme={isDarkMode ? darkTheme() : lightTheme()}>
          <ProgressBar height="3px" color="#2299dd" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
