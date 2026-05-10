"use client";

import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";

// Mirrors the id in useOrgGasSponsorship.ts (kept local rather than exported
// because there are only two call sites and the string is part of the
// connector ABI, not a config knob).
const OPENFORT_EMBEDDED_CONNECTOR_ID = "xyz.openfort";

/**
 * Guards a write callback against being issued from an Openfort embedded smart
 * account. Used for transactions that must never be gas-sponsored — in
 * particular `CGRegistry` writes, which can't be routed through CGPaymaster
 * (no sponsoring org exists for `createOrganization`, and `removeOrganization`
 * targets the registry itself, which is not org-owned). Without this guard
 * those calls go to Openfort's bundler, hit the provider-level CGPaymaster
 * policy, and fail at validation with an opaque `-32002`.
 *
 * The hook returns:
 *   - `isUnsponsorable`: true when the current connector cannot send an
 *     unsponsored tx (i.e. it's the Openfort embedded smart account, whose
 *     paymaster policy is baked into the provider and can't be bypassed
 *     per-call). Use to disable buttons and show inline hints.
 *   - `assertCanWrite()`: imperative check — returns true to proceed, false
 *     after firing a user-facing error notification. Call it as the first
 *     line of any handler that issues a registry write.
 */
export const useRequireUnsponsorable = () => {
  const { connector } = useAccount();
  const isUnsponsorable = connector?.id === OPENFORT_EMBEDDED_CONNECTOR_ID;

  const assertCanWrite = () => {
    if (isUnsponsorable) {
      notification.error(
        "Registry actions can't be gas-sponsored. Sign out of the embedded wallet and reconnect with a regular wallet (MetaMask, WalletConnect, …).",
      );
      return false;
    }
    return true;
  };

  return { isUnsponsorable, assertCanWrite } as const;
};
