"use client";

import { usePathname } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

type Props = {
  hideOnHome?: boolean;
  size?: "sm" | "md";
};

export const EmbeddedWalletButton = ({ hideOnHome = false, size = "sm" }: Props) => {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const { open } = useAppKit();

  if (isConnected) return null;
  if (hideOnHome && pathname === "/") return null;

  const btnSize = size === "md" ? "btn-md" : "btn-sm";

  return (
    <button className={`btn btn-error ${btnSize} gap-2`} onClick={() => open()} type="button">
      <EnvelopeIcon className="h-4 w-4" />
      Sign in with Email
    </button>
  );
};
