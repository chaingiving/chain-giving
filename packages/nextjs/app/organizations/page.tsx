"use client";

import { useState } from "react";
import Link from "next/link";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { Address, isAddressEqual } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const PAGE_SIZE = 10;

const OrgCard = ({ address }: { address: Address }) => {
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
    query: { refetchInterval: 30000 },
  });

  return (
    <Link href={`/organization/${address}`} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
      <div className="card-body p-4">
        <h3 className="card-title text-lg">{name || "Loading..."}</h3>
        <div className="flex items-center gap-2 text-sm opacity-70">
          <span>Owner:</span>
          <AddressDisplay address={owner} size="sm" />
        </div>
        <div className="text-sm opacity-70">
          {programCount?.toString() ?? "0"} {programCount === 1n ? "program" : "programs"}
        </div>
      </div>
    </Link>
  );
};

const OrganizationsPage = () => {
  const { address: connectedAddress } = useAccount();
  const [newOrgName, setNewOrgName] = useState("");
  const [page, setPage] = useState(0);

  const { data: orgCount } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "organizationCount",
    watch: true,
  });

  const { data: registryOwner } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "owner",
  });

  const { data: orgAddresses } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "getOrganizations",
    args: [BigInt(page * PAGE_SIZE), BigInt(PAGE_SIZE)],
    watch: true,
  });

  const { writeContractAsync: writeRegistry, isPending } = useScaffoldWriteContract("CGRegistry");

  const isRegistryOwner = connectedAddress && registryOwner ? isAddressEqual(connectedAddress, registryOwner) : false;
  const totalOrgs = Number(orgCount ?? 0n);
  const totalPages = Math.max(1, Math.ceil(totalOrgs / PAGE_SIZE));

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    try {
      await writeRegistry({ functionName: "createOrganization", args: [newOrgName.trim()] });
      setNewOrgName("");
    } catch (e) {
      console.error("Failed to create organization:", e);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Organizations</h1>

      {isRegistryOwner && (
        <div className="card bg-base-200 mb-8">
          <div className="card-body p-4">
            <h2 className="card-title text-lg">Create Organization</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Organization name"
                className="input input-bordered flex-1"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateOrg()}
              />
              <button className="btn btn-primary" onClick={handleCreateOrg} disabled={isPending || !newOrgName.trim()}>
                {isPending ? <span className="loading loading-spinner loading-sm" /> : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {totalOrgs === 0 ? (
        <p className="text-center opacity-60 py-8">No organizations yet.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {orgAddresses?.map(addr => <OrgCard key={addr} address={addr} />)}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button className="btn btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                Previous
              </button>
              <span className="btn btn-sm btn-ghost no-animation">
                {page + 1} / {totalPages}
              </span>
              <button className="btn btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OrganizationsPage;
