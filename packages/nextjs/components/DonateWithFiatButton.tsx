"use client";

import { useEffect, useRef, useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { CreditCardIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { useSiweAuth } from "~~/hooks/useSiweAuth";
import { notification } from "~~/utils/scaffold-eth";

const SANDBOX_ORIGIN = "https://pay-sandbox.coinbase.com";
const PROD_ORIGIN = "https://pay.coinbase.com";
const SELECT_ASSET_PATH = "/buy/select-asset";

const TRUSTED_HOSTS = new Set(["pay.coinbase.com", "pay-sandbox.coinbase.com"]);

const FIAT_BY_ASSET = {
  USDC: "USD",
  EURC: "EUR",
} as const;

type Asset = keyof typeof FIAT_BY_ASSET;

type Props = {
  asset: Asset;
  targetAddress: Address;
  disabled?: boolean;
};

export const DonateWithFiatButton = ({ asset, targetAddress, disabled }: Props) => {
  const [loading, setLoading] = useState(false);
  const { ensureSignedIn } = useSiweAuth();
  const { isConnected } = useAccount();
  const { open: openConnectModal } = useAppKit();
  const popupRef = useRef<Window | null>(null);
  const closePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const cleanup = () => {
    if (messageHandlerRef.current) {
      window.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (closePollRef.current) {
      clearInterval(closePollRef.current);
      closePollRef.current = null;
    }
    popupRef.current = null;
  };

  useEffect(() => cleanup, []);

  if (!isConnected) {
    return (
      <button className="btn btn-error gap-2" onClick={() => openConnectModal()} type="button" disabled={disabled}>
        <EnvelopeIcon className="h-4 w-4" />
        Sign in
      </button>
    );
  }

  const handleClick = async () => {
    if (loading) return;

    // Open the popup synchronously to bypass popup blockers; navigate it after the fetch.
    const isSandbox = process.env.NEXT_PUBLIC_ONRAMP_SANDBOX === "true";
    const origin = isSandbox ? SANDBOX_ORIGIN : PROD_ORIGIN;

    const popup = window.open("about:blank", "cb-onramp", "popup,width=470,height=750");
    if (!popup) {
      notification.error("Popup blocked. Allow popups for this site to donate by card.");
      return;
    }
    popupRef.current = popup;

    setLoading(true);
    try {
      let userAddress: Address;
      try {
        userAddress = await ensureSignedIn();
      } catch (err) {
        notification.error(err instanceof Error ? err.message : "Wallet sign-in required");
        popup.close();
        cleanup();
        return;
      }
      const res = await fetch("/api/onramp/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, address: targetAddress }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? `Session token request failed (${res.status})`);
      }
      const { token } = (await res.json()) as { token: string };

      const params = new URLSearchParams({
        sessionToken: token,
        defaultAsset: asset,
        defaultNetwork: isSandbox ? "base-sepolia" : "base",
        fiatCurrency: FIAT_BY_ASSET[asset],
        partnerUserRef: `cg-${userAddress}`,
      });
      // Coinbase Onramp rejects redirectUrl unless the origin is allowlisted in
      // the CDP portal. Set NEXT_PUBLIC_ONRAMP_REDIRECT_ORIGIN to the registered
      // origin on prod; leave unset on dev/preview.
      const redirectOrigin = process.env.NEXT_PUBLIC_ONRAMP_REDIRECT_ORIGIN;
      if (redirectOrigin) {
        params.set("redirectUrl", `${redirectOrigin}/thank-you`);
      }
      const onrampUrl = `${origin}${SELECT_ASSET_PATH}?${params}`;
      popup.location.href = onrampUrl;

      const onMessage = (e: MessageEvent) => {
        let host: string;
        try {
          host = new URL(e.origin).hostname;
        } catch {
          return;
        }
        if (!TRUSTED_HOSTS.has(host)) return;

        const data = typeof e.data === "string" ? safeParse(e.data) : e.data;
        const eventName = data?.eventName ?? data?.data?.eventName;

        if (eventName === "success") {
          notification.success("Onramp purchase confirmed. Funds will arrive shortly.");
          window.dispatchEvent(new CustomEvent("donation-onramp-success", { detail: { asset, targetAddress } }));
          popup.close();
          cleanup();
        } else if (eventName === "exit") {
          popup.close();
          cleanup();
        }
      };
      messageHandlerRef.current = onMessage;
      window.addEventListener("message", onMessage);

      // Detect manual popup close (no message fired).
      closePollRef.current = setInterval(() => {
        if (popup.closed) cleanup();
      }, 1000);
    } catch (err) {
      console.error("[DonateWithFiatButton]", err);
      notification.error(err instanceof Error ? err.message : "Could not start onramp session");
      popup.close();
      cleanup();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="btn btn-error" onClick={handleClick} disabled={disabled || loading}>
      {loading ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        <>
          <CreditCardIcon className="h-4 w-4" />
          Donate
        </>
      )}
    </button>
  );
};

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
