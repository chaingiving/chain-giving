"use client";

import { useEffect, useState } from "react";

// User-level opt-out for Chain.Giving's sponsored-gas path. When false, every
// hook that reads `useOrgGasSponsorship().isSponsorshipAvailable` falls back to
// a plain writeContract — the wallet pays its own gas. Persisted in
// localStorage so the choice survives reloads, and synced across tabs via the
// `storage` event plus a same-tab custom event.
const KEY = "chaingiving:useSponsoredGas";
const EVENT = "chaingiving:useSponsoredGasChanged";

const readPreference = (): boolean => {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return true;
  return raw !== "false";
};

export const useSponsoredGasPreference = () => {
  // Default false true on the server / first client render to avoid hydration
  // mismatch; the effect below reconciles with the persisted value.
  const [enabled, setEnabledState] = useState<boolean>(false);

  useEffect(() => {
    setEnabledState(readPreference());
    const onChange = () => setEnabledState(readPreference());
    window.addEventListener("storage", onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(EVENT, onChange);
    };
  }, []);

  const setEnabled = (next: boolean) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, next ? "true" : "false");
    window.dispatchEvent(new Event(EVENT));
    setEnabledState(next);
  };

  return { enabled, setEnabled } as const;
};
