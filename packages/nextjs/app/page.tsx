"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { QRCodeSVG } from "qrcode.react";
import { type Address as ViemAddress, isAddressEqual } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { HeartIcon, UserGroupIcon, WalletIcon } from "@heroicons/react/24/outline";
import { AuthProviderInfo, SignOutButton } from "~~/components/AuthSession";
import { ChainGivingHeader } from "~~/components/ChainGivingHeader";
import { EmbeddedWalletButton } from "~~/components/ConnectButton";
import { ProgramCard } from "~~/components/ProgramCard";
import { ProgramRoleBadges, useProgramRoles } from "~~/components/ProgramRoleBadges";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

type VisibilityReporter = (address: ViemAddress, visible: boolean) => void;

const OwnedOrgCard = ({
  orgAddress,
  userAddress,
  onVisibilityChange,
}: {
  orgAddress: ViemAddress;
  userAddress: ViemAddress;
  onVisibilityChange: VisibilityReporter;
}) => {
  const { data: owner } = useReadContract({
    address: orgAddress,
    abi: cgOrganizationAbi,
    functionName: "owner",
    query: { refetchInterval: 30000 },
  });

  const isOwner = !!owner && isAddressEqual(owner, userAddress);

  useEffect(() => {
    onVisibilityChange(orgAddress, isOwner);
    return () => onVisibilityChange(orgAddress, false);
  }, [orgAddress, isOwner, onVisibilityChange]);

  const { data: name } = useReadContract({
    address: orgAddress,
    abi: cgOrganizationAbi,
    functionName: "name",
    query: { enabled: isOwner, refetchInterval: 30000 },
  });

  const { data: programCount } = useReadContract({
    address: orgAddress,
    abi: cgOrganizationAbi,
    functionName: "programCount",
    query: { enabled: isOwner, refetchInterval: 30000 },
  });

  if (!isOwner) return null;

  return (
    <Link href={`/organization/${orgAddress}`} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
      <div className="card-body p-4">
        <h3 className="card-title text-lg">{name || "Loading..."}</h3>
        <div className="text-sm opacity-70">
          {programCount?.toString() ?? "0"} {programCount === 1n ? "program" : "programs"}
        </div>
      </div>
    </Link>
  );
};

const UserProgramCard = ({
  programAddress,
  orgAddress,
  userAddress,
  orgName,
  onVisibilityChange,
}: {
  programAddress: ViemAddress;
  orgAddress: ViemAddress;
  userAddress: ViemAddress;
  orgName?: string;
  onVisibilityChange: VisibilityReporter;
}) => {
  const roles = useProgramRoles({ programAddress, orgAddress, userAddress });

  useEffect(() => {
    onVisibilityChange(programAddress, roles.anyRole);
    return () => onVisibilityChange(programAddress, false);
  }, [programAddress, roles.anyRole, onVisibilityChange]);

  if (!roles.anyRole) return null;

  return <ProgramCard address={programAddress} orgName={orgName} roleBadges={<ProgramRoleBadges roles={roles} />} />;
};

const OrgPrograms = ({
  orgAddress,
  userAddress,
  onVisibilityChange,
}: {
  orgAddress: ViemAddress;
  userAddress: ViemAddress;
  onVisibilityChange: VisibilityReporter;
}) => {
  const { data: orgName } = useReadContract({
    address: orgAddress,
    abi: cgOrganizationAbi,
    functionName: "name",
    query: { refetchInterval: 30000 },
  });

  const { data: programAddresses } = useReadContract({
    address: orgAddress,
    abi: cgOrganizationAbi,
    functionName: "getPrograms",
    args: [0n, 100n],
    query: { refetchInterval: 5000 },
  });

  if (!programAddresses || programAddresses.length === 0) return null;

  return (
    <>
      {programAddresses.map(addr => (
        <UserProgramCard
          key={addr}
          programAddress={addr}
          orgAddress={orgAddress}
          userAddress={userAddress}
          orgName={orgName ?? undefined}
          onVisibilityChange={onVisibilityChange}
        />
      ))}
    </>
  );
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  const { data: orgAddresses } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "getOrganizations",
    args: [0n, 100n],
    watch: true,
  });

  const [visibleOwnedOrgs, setVisibleOwnedOrgs] = useState<Set<ViemAddress>>(new Set());
  const [visiblePrograms, setVisiblePrograms] = useState<Set<ViemAddress>>(new Set());

  const reportOrgVisibility = useCallback<VisibilityReporter>((addr, visible) => {
    setVisibleOwnedOrgs(prev => {
      if (prev.has(addr) === visible) return prev;
      const next = new Set(prev);
      if (visible) next.add(addr);
      else next.delete(addr);
      return next;
    });
  }, []);

  const reportProgramVisibility = useCallback<VisibilityReporter>((addr, visible) => {
    setVisiblePrograms(prev => {
      if (prev.has(addr) === visible) return prev;
      const next = new Set(prev);
      if (visible) next.add(addr);
      else next.delete(addr);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col grow w-full max-w-6xl mx-auto px-4 pt-8 pb-12">
      <ChainGivingHeader />

      {!connectedAddress ? (
        <div className="mt-8 flex flex-col gap-8">
          <div className="card bg-base-100 shadow-md border border-base-300 rounded-3xl px-6 py-10 flex flex-col items-center gap-5">
            <p className="opacity-70 text-center">
              Sign in to see your account and activity. No need to create an account.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <EmbeddedWalletButton size="md" />
              <RainbowKitCustomConnectButton size="md" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/organizations"
              className="card bg-base-100 shadow-md border border-base-300 rounded-3xl px-6 py-8 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <UserGroupIcon className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Browse Organizations</h2>
                  <p className="text-sm opacity-70">See who running programs</p>
                </div>
              </div>
            </Link>
            <Link
              href="/programs"
              className="card bg-base-100 shadow-md border border-base-300 rounded-3xl px-6 py-8 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                <HeartIcon className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Browse Programs</h2>
                  <p className="text-sm opacity-70">Explore active crowdfundings</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 mt-8">
          <aside className="md:w-72 lg:w-80 md:shrink-0">
            <div className="card bg-base-100 shadow-xl border border-base-300 rounded-3xl px-6 py-6 flex flex-col items-center gap-4 md:sticky md:top-4">
              <p className="my-2 font-medium">Your Account</p>
              <div className="cg-qr-pulse p-3 bg-base-100 rounded-2xl shadow-inner">
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
                <style>{`
                  .cg-qr-pulse svg image {
                    transform-box: fill-box;
                    transform-origin: center;
                    animation: cg-qr-pulse 2.6s ease-in-out infinite;
                  }
                  @keyframes cg-qr-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.06); }
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .cg-qr-pulse svg image { animation: none; }
                  }
                `}</style>
              </div>
              <Address
                address={connectedAddress}
                chain={targetNetwork}
                blockExplorerAddressLink={getBlockExplorerAddressLink(targetNetwork, connectedAddress)}
              />
              <AuthProviderInfo className="justify-center" />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href={`/wallet/${connectedAddress}`} className="btn btn-sm btn-outline gap-2">
                  <WalletIcon className="h-4 w-4" />
                  View Wallet
                </Link>
                <SignOutButton size="sm" />
              </div>
            </div>
          </aside>

          <main className="flex-1 flex flex-col gap-8 min-w-0">
            <section className={visibleOwnedOrgs.size === 0 ? "hidden" : undefined}>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-3">
                <UserGroupIcon className="h-5 w-5" />
                Your Organizations
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {orgAddresses?.map(orgAddr => (
                  <OwnedOrgCard
                    key={orgAddr}
                    orgAddress={orgAddr}
                    userAddress={connectedAddress}
                    onVisibilityChange={reportOrgVisibility}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-3">
                <HeartIcon className="h-5 w-5" />
                Your Programs
              </h2>
              <div className={`grid gap-3 ${visiblePrograms.size === 0 ? "hidden" : ""}`}>
                {orgAddresses?.map(orgAddr => (
                  <OrgPrograms
                    key={orgAddr}
                    orgAddress={orgAddr}
                    userAddress={connectedAddress}
                    onVisibilityChange={reportProgramVisibility}
                  />
                ))}
              </div>
              {visiblePrograms.size === 0 && (
                <p className="text-sm opacity-70">
                  You have not contributed to any program yet,{" "}
                  <Link href="/programs" className="link link-primary">
                    check out existing programs
                  </Link>
                  .
                </p>
              )}
            </section>
          </main>
        </div>
      )}

      <footer className="mt-12 pt-6 border-t border-base-300 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs opacity-60">
        <span>
          © 2026 Chain.Giving. Help:{" "}
          <a href="mailto:contact@chain.giving" className="link">
            contact@chain.giving
          </a>
        </span>
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <span className="inline-flex flex-col items-stretch leading-none rounded border border-base-300 overflow-hidden text-[9px]">
            <span className="px-1.5 py-0.5 bg-base-300 uppercase tracking-wide text-center">Version</span>
            <span className="px-1.5 py-0.5 font-mono text-center">{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          </span>
        )}
      </footer>
    </div>
  );
};

export default Home;
