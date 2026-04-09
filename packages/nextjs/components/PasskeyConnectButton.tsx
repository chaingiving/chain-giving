"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

export const EmbeddedWalletButton = () => {
  const { isConnected } = useAccount();
  const { open } = useAppKit();

  if (isConnected) return null;

  return (
    <button className="btn btn-primary btn-sm gap-2" onClick={() => open()} type="button">
      <EnvelopeIcon className="h-4 w-4" />
      Sign in with Email
    </button>
  );
};
