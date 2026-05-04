"use client";

import { useEffect, useState } from "react";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { QRCodeSVG } from "qrcode.react";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { CurrencyLogo } from "~~/components/CurrencyLogo";
import { DonationCurrency } from "~~/contracts/donationCurrencies";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getBlockExplorerAddressLink, notification } from "~~/utils/scaffold-eth";

// CDP faucet supports these chains; keep in sync with app/api/faucet/route.ts.
const FAUCET_CHAIN_IDS = new Set<number>([84532]);
const FAUCET_TOKEN_BY_SYMBOL: Record<string, string> = { USDC: "usdc", EURC: "eurc" };

type Props = {
  walletAddress: Address;
  currency: DonationCurrency;
  onClose: () => void;
};

export function TopUpModal({ walletAddress, currency, onClose }: Props) {
  const { chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const network = chain ?? targetNetwork;
  const [faucetPending, setFaucetPending] = useState(false);

  const faucetSupported = FAUCET_CHAIN_IDS.has(network.id) && FAUCET_TOKEN_BY_SYMBOL[currency.symbol] !== undefined;

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
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletAddress,
          token: FAUCET_TOKEN_BY_SYMBOL[currency.symbol],
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
      <div className="modal-box flex flex-col items-center gap-4 max-w-lg">
        <button className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3" onClick={onClose}>
          ✕
        </button>
        <div className="flex items-center gap-2">
          <CurrencyLogo currency={currency} size={24} />
          <p className="font-semibold text-lg">Receive {currency.symbol}</p>
        </div>
        <p className="text-sm text-center opacity-80">
          Send <span className="font-semibold">{currency.symbol}</span> on{" "}
          <span className="font-semibold">{network.name}</span> to this address.
        </p>
        <div className="p-3 bg-base-100 rounded-2xl shadow-inner">
          <QRCodeSVG
            value={walletAddress}
            size={160}
            bgColor="#ffffff"
            fgColor="#258597"
            level="H"
            imageSettings={{ src: "/logo.svg", width: 36, height: 36, excavate: true }}
          />
        </div>
        <AddressDisplay
          address={walletAddress}
          format="long"
          blockExplorerAddressLink={getBlockExplorerAddressLink(network, walletAddress)}
        />
        <div className="w-full text-xs opacity-60 flex flex-col gap-1">
          <span>
            <strong>Network:</strong> {network.name}
          </span>
          <span className="break-all">
            <strong>{currency.symbol} contract:</strong> {currency.address}
          </span>
        </div>
        {faucetSupported && (
          <div className="w-full flex flex-col gap-2 border-t border-base-300">
            <p className="text-sm">On testnet you can request a small amount of test tokens</p>
            <button className="btn btn-primary btn-sm" disabled={faucetPending} onClick={requestFaucet}>
              {faucetPending ? <span className="loading loading-spinner loading-xs" /> : `Get test ${currency.symbol}`}
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
