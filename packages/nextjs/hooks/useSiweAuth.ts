"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Address, getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useChainId, useSignMessage } from "wagmi";

type SiweState = {
  isLoggedIn: boolean;
  address?: Address;
  chainId?: number;
  loading: boolean;
};

type SessionResponse = {
  isLoggedIn?: boolean;
  address?: Address;
  chainId?: number;
};

const SIGN_IN_STATEMENT = "Sign in with Ethereum to Chain.Giving.";

export function useSiweAuth() {
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<SiweState>({ isLoggedIn: false, loading: true });
  const inFlight = useRef<Promise<Address> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/siwe/session", { credentials: "same-origin" });
        if (!res.ok) throw new Error("session fetch failed");
        const data = (await res.json()) as SessionResponse;
        if (cancelled) return;
        setState({
          isLoggedIn: !!data.isLoggedIn,
          address: data.address,
          chainId: data.chainId,
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ isLoggedIn: false, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/siwe/session", { method: "DELETE", credentials: "same-origin" });
    setState({ isLoggedIn: false, loading: false });
  }, []);

  const ensureSignedIn = useCallback(async (): Promise<Address> => {
    if (!isConnected || !connectedAddress) {
      throw new Error("Connect a wallet first");
    }
    const checksummed = getAddress(connectedAddress);
    if (state.isLoggedIn && state.address === checksummed) {
      return checksummed;
    }
    if (inFlight.current) return inFlight.current;

    const flow = (async () => {
      const nonceRes = await fetch("/api/siwe/nonce", { credentials: "same-origin" });
      if (!nonceRes.ok) throw new Error("Could not fetch SIWE nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = createSiweMessage({
        domain: window.location.host,
        address: checksummed,
        statement: SIGN_IN_STATEMENT,
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
        issuedAt: new Date(),
      });

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/siwe/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "SIWE verification failed");
      }
      const data = (await verifyRes.json()) as SessionResponse;
      setState({
        isLoggedIn: true,
        address: data.address ?? checksummed,
        chainId: data.chainId ?? chainId,
        loading: false,
      });
      return checksummed;
    })();

    inFlight.current = flow;
    try {
      return await flow;
    } finally {
      inFlight.current = null;
    }
  }, [chainId, connectedAddress, isConnected, signMessageAsync, state.address, state.isLoggedIn]);

  return { ...state, ensureSignedIn, signOut };
}
