"use client";

import { Hooks } from "porto/wagmi";
import { useAccount, useConnectors } from "wagmi";
import { KeyIcon } from "@heroicons/react/24/outline";

export const PORTO_CONNECTOR_ID = "xyz.ithaca.porto";

export const PasskeyConnectButton = () => {
  const { isConnected } = useAccount();
  const connectors = useConnectors();
  const portoConnector = connectors.find(c => c.id === PORTO_CONNECTOR_ID);

  const { mutate: connect, isPending } = Hooks.useConnect();

  if (isConnected || !portoConnector) return null;

  return (
    <button
      className="btn btn-primary btn-sm gap-2"
      onClick={() => connect({ connector: portoConnector })}
      disabled={isPending}
      type="button"
    >
      <KeyIcon className="h-4 w-4" />
      {isPending ? "Connecting..." : "Sign in with Passkey"}
    </button>
  );
};
