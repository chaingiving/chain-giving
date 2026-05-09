"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

type Props = {
  hideOnHome?: boolean;
  size?: "sm" | "md";
};

const EmbeddedWalletButtonInner = ({ hideOnHome = false, size = "sm" }: Props) => {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const { open } = useAppKit();

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

// useAppKit reads global state populated by createAppKit, which only runs in
// the browser (see services/web3/wagmiConfig.tsx). Defer until mount so SSG
// never invokes it.
export const EmbeddedWalletButton = (props: Props) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <EmbeddedWalletButtonInner {...props} />;
};
