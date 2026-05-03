"use client";

import { Component, ErrorInfo, ReactNode } from "react";
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

// Reown's createAppKit can fail (e.g. when the deployment origin isn't on the
// allowlist in cloud.reown.com). Swallow the failure here so the rest of the
// app still boots in a degraded mode where AppKit features aren't available.
try {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId: scaffoldConfig.walletConnectProjectId,
    networks: enabledChains as any,
  });
} catch (error) {
  console.warn("createAppKit failed; running without Reown AppKit:", error);
}

class ProvidersErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Wallet providers crashed; rendering degraded UI:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col min-h-screen items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">Wallet features are temporarily unavailable</h1>
          <p className="opacity-70 max-w-md">
            The wallet provider failed to initialize. This is usually a configuration issue (for example, the current
            domain isn&apos;t on the WalletConnect / Reown allowlist). The rest of Chain.Giving will be back online once
            this is resolved.
          </p>
          <pre className="text-xs opacity-50 max-w-full overflow-auto">{this.state.message}</pre>
          <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()} type="button">
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ProvidersErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider avatar={BlockieAvatar} theme={isDarkMode ? darkTheme() : lightTheme()}>
            <ProgressBar height="3px" color="#2299dd" />
            <ScaffoldEthApp>{children}</ScaffoldEthApp>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ProvidersErrorBoundary>
  );
};
