"use client";

import Image from "next/image";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { QRCodeSVG } from "qrcode.react";
import { useAccount } from "wagmi";
import { WalletIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <Image src="/chain_giving_header.png" alt="Chain.Giving" width={500} height={150} className="mx-auto" />
          <div className="flex justify-center items-center flex-col mt-4">
            {connectedAddress ? (
              <div className="card bg-base-100 shadow-xl border border-base-300 rounded-3xl px-8 py-6 flex flex-col items-center gap-4">
                <p className="my-2 font-medium">Your Account</p>
                <div className="p-3 bg-base-100 rounded-2xl shadow-inner">
                  <QRCodeSVG
                    value={connectedAddress}
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
                <Address
                  address={connectedAddress}
                  chain={targetNetwork}
                  blockExplorerAddressLink={getBlockExplorerAddressLink(targetNetwork, connectedAddress)}
                />
                <Link href={`/wallet/${connectedAddress}`} className="btn btn-sm btn-outline gap-2">
                  <WalletIcon className="h-4 w-4" />
                  View Wallet
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
