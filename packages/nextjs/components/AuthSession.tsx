"use client";

import { useEffect, useState } from "react";
import { useSignOut, useUser } from "@openfort/react";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email",
  //google: "Google",
  //apple: "Apple",
  //facebook: "Facebook",
  //discord: "Discord",
  guest: "Guest",
};

function formatProvider(provider: string | undefined) {
  if (!provider) return undefined;
  return PROVIDER_LABEL[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Renders provider + user identifier when the connected account is an Openfort
// embedded wallet (email / social login). For raw wallets it returns null.
function AuthProviderInfoInner({ className = "" }: { className?: string }) {
  const { user, linkedAccounts, isAuthenticated } = useUser();
  if (!isAuthenticated) return null;

  // Pick the first non-wallet linked account as the "Signed in with" source.
  // Fall back to user.isAnonymous (guest) or user.email when linkedAccounts is empty.
  const primaryAccount = linkedAccounts?.find(a => a.provider !== "wallet" && a.provider !== "siwe");
  const u = user as { isAnonymous?: boolean; email?: string | null } | undefined;
  const inferredProvider = u?.isAnonymous ? "guest" : u?.email ? "email" : undefined;
  const provider = formatProvider(primaryAccount?.provider ?? inferredProvider);
  if (!provider) return null;

  const identifier = u?.isAnonymous ? undefined : (u?.email ?? user?.name);

  return (
    <div className={`text-xs opacity-70 flex flex-wrap items-center gap-1 ${className}`}>
      <span>Signed in with {provider}</span>
      {identifier && <span className="font-mono break-all">{identifier}</span>}
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
  const { signOut, isLoading } = useSignOut();
  return (
    <button
      type="button"
      className={`btn btn-${size} btn-outline btn-error gap-2 ${className}`}
      onClick={() => signOut()}
      disabled={isLoading}
    >
      <ArrowRightOnRectangleIcon className="h-4 w-4" />
      Sign out
    </button>
  );
}

// Mount-gated to keep Openfort hooks (which read client-only state) out of the
// SSR/SSG render path, mirroring the EmbeddedWalletButton pattern.
export function SignOutButton(props: SignOutButtonProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <SignOutButtonInner {...props} />;
}
