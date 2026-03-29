"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";

type QrScannerModalProps = {
  onScan: (value: string) => void;
  onClose: () => void;
};

export function QrScannerModal({ onScan, onClose }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!videoRef.current) return;

    const reader = new BrowserQRCodeReader();
    let cancelled = false;

    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled) return;
        if (result) {
          controls.stop();
          onScanRef.current(result.getText());
          onCloseRef.current();
        }
      })
      .catch(e => {
        if (!cancelled) setError(e?.message ?? "Camera access denied");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="modal modal-open">
      <div className="modal-box flex flex-col items-center gap-3 max-w-sm">
        <h3 className="font-bold text-lg">Scan QR Code</h3>
        {error ? (
          <p className="text-error text-sm">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-lg" autoPlay muted playsInline />
        )}
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
