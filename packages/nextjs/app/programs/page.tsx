"use client";

import { Address } from "viem";
import { useReadContract } from "wagmi";
import { ProgramCard } from "~~/components/ProgramCard";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const OrgPrograms = ({ orgAddress }: { orgAddress: Address }) => {
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
    args: [0n, BigInt(100)],
    query: { refetchInterval: 5000 },
  });

  if (!programAddresses || programAddresses.length === 0) return null;

  return (
    <>
      {programAddresses.map(addr => (
        <ProgramCard key={addr} address={addr} orgName={orgName ?? undefined} />
      ))}
    </>
  );
};

const ProgramsPage = () => {
  const { data: orgCount } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "organizationCount",
    watch: true,
  });

  const { data: orgAddresses } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "getOrganizations",
    args: [0n, BigInt(100)],
    watch: true,
  });

  const totalOrgs = Number(orgCount ?? 0n);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">All Programs</h1>

      {totalOrgs === 0 ? (
        <div className="text-center py-12">
          <p className="opacity-60 mb-4">No programs yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {orgAddresses?.map((orgAddr: string) => <OrgPrograms key={orgAddr} orgAddress={orgAddr} />)}
        </div>
      )}
    </div>
  );
};

export default ProgramsPage;
