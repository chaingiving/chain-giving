"use client";

import { useEffect, useState } from "react";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { QRCodeSVG } from "qrcode.react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { CurrencyLogo } from "~~/components/CurrencyLogo";
import { DonationCurrency } from "~~/contracts/donationCurrencies";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useSiweAuth } from "~~/hooks/useSiweAuth";
import { getBlockExplorerAddressLink, notification } from "~~/utils/scaffold-eth";

// CDP faucet supports these chains; keep in sync with app/api/faucet/route.ts.
const FAUCET_CHAIN_IDS = new Set<number>([84532]);
const FAUCET_TOKEN_BY_SYMBOL: Record<string, string> = { USDC: "usdc", EURC: "eurc", ETH: "eth" };

type Props = {
  walletAddress: Address;
  /** ERC-20 currency. Omit when `native` is true. */
  currency?: DonationCurrency;
  /** When set, render the modal for the chain's native asset (e.g. ETH). */
  native?: { symbol: string };
  onClose: () => void;
};

export function TopUpModal({ walletAddress, currency, native, onClose }: Props) {
  const { chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const network = chain ?? targetNetwork;
  const [faucetPending, setFaucetPending] = useState(false);
  const { ensureSignedIn } = useSiweAuth();

  const symbol = native ? native.symbol : (currency?.symbol ?? "");
  const faucetSupported = FAUCET_CHAIN_IDS.has(network.id) && FAUCET_TOKEN_BY_SYMBOL[symbol] !== undefined;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const requestFaucet = async () => {
    setFaucetPending(true);
    try {
      try {
        await ensureSignedIn();
      } catch (err) {
        notification.error(err instanceof Error ? err.message : "Wallet sign-in required");
        return;
      }
      const res = await fetch("/api/faucet", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          token: FAUCET_TOKEN_BY_SYMBOL[symbol],
          chainId: network.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; transactionHash?: string };
      if (!res.ok) {
        notification.error(data.error || "Faucet request failed");
        return;
      }
      notification.success(
        data.transactionHash ? `Faucet sent! tx ${data.transactionHash.slice(0, 10)}…` : "Faucet request submitted",
      );
    } catch (err) {
      notification.error((err as Error).message || "Network error");
    } finally {
      setFaucetPending(false);
    }
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box flex flex-col items-center gap-3 w-[calc(100%-1rem)] max-w-lg p-4 sm:p-6 min-w-0">
        <button className="btn btn-ghost btn-sm btn-circle absolute right-2 top-2" onClick={onClose}>
          ✕
        </button>
        <div className="flex items-center gap-2">
          {currency && <CurrencyLogo currency={currency} size={20} />}
          <p className="font-semibold text-base">Receive {symbol}</p>
        </div>
        <p className="text-xs text-center opacity-80">
          Send <span className="font-semibold">{symbol}</span> on <span className="font-semibold">{network.name}</span>{" "}
          to this address.
        </p>
        <div className="p-3 bg-base-100 rounded-2xl shadow-inner">
          <QRCodeSVG
            value={walletAddress}
            size={144}
            bgColor="#ffffff"
            fgColor="#258597"
            level="H"
            imageSettings={{ src: "/logo.svg", width: 32, height: 32, excavate: true }}
          />
        </div>
        <div className="max-w-full overflow-hidden">
          <span className="hidden sm:inline-flex">
            <AddressDisplay
              address={walletAddress}
              format="long"
              blockExplorerAddressLink={getBlockExplorerAddressLink(network, walletAddress)}
            />
          </span>
          <span className="sm:hidden inline-flex">
            <AddressDisplay
              address={walletAddress}
              format="short"
              blockExplorerAddressLink={getBlockExplorerAddressLink(network, walletAddress)}
            />
          </span>
        </div>
        <div className="w-full text-[11px] opacity-60 flex flex-col gap-1 min-w-0">
          <span>
            <strong>Network:</strong> {network.name}
          </span>
          {currency && (
            <span className="break-all">
              <strong>{currency.symbol} contract:</strong> {currency.address}
            </span>
          )}
          {native && (
            <span>
              <strong>Asset:</strong> native {symbol}
            </span>
          )}
        </div>
        {faucetSupported && (
          <div className="w-full flex flex-col gap-2 border-t border-base-300 pt-3">
            <p className="text-xs">On testnet you can request a small amount of test tokens.</p>
            <button className="btn btn-primary btn-sm" disabled={faucetPending} onClick={requestFaucet}>
              {faucetPending ? <span className="loading loading-spinner loading-xs" /> : `Get test ${symbol}`}
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
