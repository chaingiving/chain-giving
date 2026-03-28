"use client";

import Link from "next/link";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { Address } from "viem";
import { useReadContract } from "wagmi";
import { cgProgramAbi } from "~~/contracts/cgProgramAbi";

export const PROGRAM_STATES = ["Active", "Executing", "Completed", "Cancelled"] as const;
const PROGRAM_STATE_COLORS = ["badge-success", "badge-warning", "badge-info", "badge-error"] as const;

export const ProgramCard = ({ address, orgName }: { address: Address; orgName?: string }) => {
  const { data: name } = useReadContract({
    address,
    abi: cgProgramAbi,
    functionName: "name",
    query: { refetchInterval: 30000 },
  });

  const { data: state } = useReadContract({
    address,
    abi: cgProgramAbi,
    functionName: "state",
    query: { refetchInterval: 10000 },
  });

  const stateIndex = Number(state ?? 0);

  return (
    <Link href={`/program/${address}`} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-lg">{name || "Loading..."}</h3>
          <span className={`badge ${PROGRAM_STATE_COLORS[stateIndex]} badge-sm`}>{PROGRAM_STATES[stateIndex]}</span>
        </div>
        <div className="flex items-center gap-4 text-sm opacity-60">
          {orgName && <span>Org: {orgName}</span>}
          <AddressDisplay address={address} size="xs" />
        </div>
      </div>
    </Link>
  );
};
