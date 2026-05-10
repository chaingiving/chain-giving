"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUI } from "@openfort/react";
import { useAccount } from "wagmi";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

type Props = {
  hideOnHome?: boolean;
  size?: "sm" | "md";
};

const EmbeddedWalletButtonInner = ({ hideOnHome = false, size = "sm" }: Props) => {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  // open() auto-routes correctly for fresh state — its internal order is
  // setOpen(true) (resets to LOADING) then setRoute(PROVIDERS), so PROVIDERS
  // wins. openProviders() reverses that order, so the LOADING reset wipes the
  // PROVIDERS route and the modal gets stuck.
  const { open } = useUI();

  if (isConnected) return null;
  if (hideOnHome && pathname === "/") return null;

  const btnSize = size === "md" ? "btn-md" : "btn-sm";

  return (
    <button className={`btn btn-error ${btnSize} gap-2`} onClick={() => open()} type="button">
      <EnvelopeIcon className="h-4 w-4" />
      Sign in
    </button>
  );
};

// Openfort's hooks read client-only state managed inside OpenfortProvider; defer
// to mount so SSG never tries to invoke them.
export const EmbeddedWalletButton = (props: Props) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <EmbeddedWalletButtonInner {...props} />;
};
