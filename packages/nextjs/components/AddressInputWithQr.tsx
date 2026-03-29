"use client";

import { useState } from "react";
import { AddressInput } from "@scaffold-ui/components";
import { Address } from "viem";
import { QrCodeIcon } from "@heroicons/react/24/outline";
import { QrScannerModal } from "~~/components/QrScannerModal";

/** Parses an EIP-681 "ethereum:" URI into a plain address string. */
function parseEthereumUri(value: string): string {
  return value.startsWith("ethereum:") ? value.slice(9).split("@")[0].split("?")[0] : value;
}

type AddressInputWithQrProps = {
  value: Address | string;
  onChange: (value: Address | string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function AddressInputWithQr({ value, onChange, placeholder, disabled }: AddressInputWithQrProps) {
  const [showScanner, setShowScanner] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <AddressInput value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Scan QR code"
          onClick={() => setShowScanner(true)}
          disabled={disabled}
        >
          <QrCodeIcon className="h-4 w-4" />
        </button>
      </div>
      {showScanner && (
        <QrScannerModal onScan={scanned => onChange(parseEthereumUri(scanned))} onClose={() => setShowScanner(false)} />
      )}
    </>
  );
}
