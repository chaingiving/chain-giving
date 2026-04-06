"use client";

import { useState } from "react";
import Link from "next/link";
import { Address as AddressDisplay, EtherInput } from "@scaffold-ui/components";
import { Address, isAddressEqual, parseEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { OrgGasSponsorshipBadge } from "~~/components/OrgGasSponsorshipBadge";
import { ProgramCard } from "~~/components/ProgramCard";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useOrgGasSponsorship } from "~~/hooks/useOrgGasSponsorship";
import { useSponsoredWrite } from "~~/hooks/useSponsoredWrite";

export const CGOrganizationView = ({ address }: { address: Address }) => {
  const { address: connectedAddress } = useAccount();
  const [newProgramName, setNewProgramName] = useState("");
  const [lockDistributions, setLockDistributions] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositKey, setDepositKey] = useState(0);

  const { data: name } = useReadContract({
    address,
    abi: cgOrganizationAbi,
    functionName: "name",
    query: { refetchInterval: 30000 },
  });

  const { data: owner } = useReadContract({
    address,
    abi: cgOrganizationAbi,
    functionName: "owner",
    query: { refetchInterval: 30000 },
  });

  const { data: programCount } = useReadContract({
    address,
    abi: cgOrganizationAbi,
    functionName: "programCount",
    query: { refetchInterval: 5000 },
  });

  const { data: programAddresses } = useReadContract({
    address,
    abi: cgOrganizationAbi,
    functionName: "getPrograms",
    args: [0n, BigInt(100)],
    query: { refetchInterval: 5000 },
  });

  // Sponsored writes for org operations (e.g., createProgram)
  const { write: sponsoredWrite, isSponsorshipAvailable } = useSponsoredWrite(address);

  const { data: registryOwner } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "owner",
  });

  const { orgBalanceFormatted, isLoading: sponsorshipLoading } = useOrgGasSponsorship(address);

  // Direct write to CGPaymaster for depositing sponsorship funds (not itself sponsored)
  const { writeContractAsync: depositForOrg, isPending: isDepositing } = useScaffoldWriteContract({
    contractName: "CGPaymaster",
  });

  const isOwner = connectedAddress && owner ? isAddressEqual(connectedAddress, owner) : false;
  const isRegistryOwner =
    connectedAddress && registryOwner ? isAddressEqual(connectedAddress, registryOwner as Address) : false;
  const canManageSponsorship = isOwner || isRegistryOwner;

  const handleDeposit = async () => {
    if (!depositAmount) return;
    try {
      await depositForOrg({
        functionName: "depositFor",
        args: [address],
        value: parseEther(depositAmount),
      });
      setDepositAmount("");
      setDepositKey(k => k + 1);
    } catch {
      // useScaffoldWriteContract handles error notifications
    }
  };

  const handleCreateProgram = async () => {
    if (!newProgramName.trim()) return;
    const success = await sponsoredWrite({
      address,
      abi: cgOrganizationAbi,
      functionName: "createProgram",
      args: [newProgramName.trim(), lockDistributions],
    });
    if (success) {
      setNewProgramName("");
      setLockDistributions(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/organizations" className="btn btn-ghost btn-sm gap-1 mb-2">
          &larr; All Organizations
        </Link>
        <h1 className="text-3xl font-bold">{name || "Loading..."}</h1>
        <div className="flex items-center gap-2 mt-1 text-sm opacity-70">
          <span>Owner:</span>
          <AddressDisplay address={owner} size="sm" />
          {isOwner && <span className="badge badge-info badge-sm">You</span>}
          <OrgGasSponsorshipBadge orgAddress={address} />
        </div>
        <p className="text-sm opacity-60 mt-1">
          {programCount?.toString() ?? "0"} {programCount === 1n ? "program" : "programs"}
        </p>
      </div>

      {canManageSponsorship && (
        <div className="card bg-base-200 shadow-md border border-base-300 mb-8">
          <div className="card-body p-6">
            <h2 className="card-title text-lg">Fund Gas Sponsorship</h2>
            <p className="text-sm opacity-70">
              Deposit ETH to sponsor gas for users interacting with this organization&apos;s programs.
              {sponsorshipLoading ? (
                <span className="loading loading-dots loading-xs ml-1" />
              ) : (
                <span className="font-medium"> Current balance: {orgBalanceFormatted ?? "0"} ETH</span>
              )}
            </p>
            <div className="flex gap-2 items-end">
              <div className="grow">
                <label className="label">
                  <span className="label-text">Amount to deposit</span>
                </label>
                <EtherInput key={depositKey} onValueChange={({ valueInEth }) => setDepositAmount(valueInEth)} />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleDeposit}
                disabled={!depositAmount || isDepositing}
              >
                {isDepositing ? <span className="loading loading-spinner loading-xs" /> : "Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card bg-base-200 shadow-md border border-base-300 mb-8">
          <div className="card-body p-6">
            <h2 className="card-title text-lg">Create New Program</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Program Name"
                className="input input-bordered"
                value={newProgramName}
                onChange={e => setNewProgramName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateProgram()}
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={lockDistributions}
                  onChange={e => setLockDistributions(e.target.checked)}
                />
                <span className="text-sm">Lock distributions after first contribution</span>
              </label>
              <button
                className="btn btn-primary btn-sm w-fit"
                onClick={handleCreateProgram}
                disabled={!newProgramName.trim()}
              >
                {isSponsorshipAvailable ? "Create Program (Gas Sponsored)" : "Create Program"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!programAddresses || programAddresses.length === 0 ? (
        <p className="text-center opacity-60 py-8">No programs yet.</p>
      ) : (
        <div className="grid gap-4">
          {programAddresses.map(addr => (
            <ProgramCard key={addr} address={addr} />
          ))}
        </div>
      )}
    </div>
  );
};
