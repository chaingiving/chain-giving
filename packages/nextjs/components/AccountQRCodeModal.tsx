"use client";

import { useEffect } from "react";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { QRCodeSVG } from "qrcode.react";
import { Address } from "viem";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

type AccountQRCodeModalProps = {
  address: Address;
  onClose: () => void;
};

export function AccountQRCodeModal({ address, onClose }: AccountQRCodeModalProps) {
  const { targetNetwork } = useTargetNetwork();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal modal-open">
      <div className="modal-box flex flex-col items-center gap-4 max-w-sm">
        <button className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3" onClick={onClose}>
          ✕
        </button>
        <p className="font-medium text-lg">Account</p>
        <div className="p-3 bg-base-100 rounded-2xl shadow-inner">
          <QRCodeSVG
            value={address}
            size={160}
            bgColor="#ffffff"
            fgColor="#258597"
            level="H"
            imageSettings={{
              src: "/logo.svg",
              width: 36,
              height: 36,
              excavate: true,
            }}
          />
        </div>
        <AddressDisplay
          address={address}
          format="long"
          blockExplorerAddressLink={getBlockExplorerAddressLink(targetNetwork, address)}
        />
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
