"use client";

import { useEffect, useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email",
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  discord: "Discord",
  facebook: "Facebook",
  x: "X",
  farcaster: "Farcaster",
};

function formatProvider(authProvider: string | undefined) {
  if (!authProvider) return undefined;
  return PROVIDER_LABEL[authProvider] ?? authProvider.charAt(0).toUpperCase() + authProvider.slice(1);
}

// Renders provider + user identifier when the connected account is a Reown
// embedded wallet (email / social login). For raw wallets it returns null.
function AuthProviderInfoInner({ className = "" }: { className?: string }) {
  const acct = useAppKitAccount();
  const info = acct?.embeddedWalletInfo;
  const provider = formatProvider(info?.authProvider);
  if (!provider) return null;

  const user = info?.user as { email?: string; username?: string } | undefined;
  const identifier = user?.email ?? user?.username;

  return (
    <div className={`text-xs opacity-70 flex flex-wrap items-center gap-1 ${className}`}>
      <span>Signed in with {provider}</span>
      {identifier && (
        <>
          <span className="font-mono break-all">{identifier}</span>
        </>
      )}
    </div>
  );
}

export function AuthProviderInfo({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <AuthProviderInfoInner className={className} />;
}

type SignOutButtonProps = {
  size?: "xs" | "sm" | "md";
  className?: string;
};

function SignOutButtonInner({ size = "sm", className = "" }: SignOutButtonProps) {
  const { disconnect, isPending } = useDisconnect();
  return (
    <button
      type="button"
      className={`btn btn-${size} btn-outline btn-error gap-2 ${className}`}
      onClick={() => disconnect()}
      disabled={isPending}
    >
      <ArrowRightOnRectangleIcon className="h-4 w-4" />
      Sign out
    </button>
  );
}

// Mount-gated to keep the wagmi hook (which reads client-only global state)
// out of the SSR/SSG render path, mirroring the EmbeddedWalletButton pattern.
export function SignOutButton(props: SignOutButtonProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <SignOutButtonInner {...props} />;
}
