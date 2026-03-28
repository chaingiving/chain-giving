"use client";

import { useState } from "react";
import Link from "next/link";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { Address, isAddressEqual } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { ProgramCard } from "~~/components/ProgramCard";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

export const CGOrganizationView = ({ address }: { address: Address }) => {
  const { address: connectedAddress } = useAccount();
  const [newProgramName, setNewProgramName] = useState("");
  const [lockDistributions, setLockDistributions] = useState(false);

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

  const { writeContractAsync } = useWriteContract();
  const writeTx = useTransactor();

  const isOwner = connectedAddress && owner ? isAddressEqual(connectedAddress, owner) : false;

  const handleCreateProgram = async () => {
    if (!newProgramName.trim()) return;
    try {
      await writeTx(() =>
        writeContractAsync({
          address,
          abi: cgOrganizationAbi,
          functionName: "createProgram",
          args: [newProgramName.trim(), lockDistributions],
        }),
      );
      setNewProgramName("");
      setLockDistributions(false);
    } catch (e) {
      const errorMessage = getParsedError(e);
      notification.error(errorMessage);
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
        </div>
        <p className="text-sm opacity-60 mt-1">{programCount?.toString() ?? "0"} program(s)</p>
      </div>

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
                Create Program
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
