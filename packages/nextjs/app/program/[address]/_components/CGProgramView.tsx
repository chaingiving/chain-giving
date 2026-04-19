"use client";

import { useState } from "react";
import { Address as AddressDisplay, Balance, EtherInput } from "@scaffold-ui/components";
import { Address, formatEther, isAddress, isAddressEqual, parseEther, zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { TrashIcon } from "@heroicons/react/24/outline";
import { AddressInputWithQr } from "~~/components/AddressInputWithQr";
import { OrgGasSponsorshipBadge } from "~~/components/OrgGasSponsorshipBadge";
import { cgProgramAbi } from "~~/contracts/cgProgramAbi";
import { useBlockExplorerLink } from "~~/hooks/scaffold-eth";
import { useProgramOrganization } from "~~/hooks/useProgramOrganization";
import { useSponsoredWrite } from "~~/hooks/useSponsoredWrite";
import { notification } from "~~/utils/scaffold-eth";

const cgCrowdfundingAbi = [
  {
    name: "contributions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  { name: "cancelContribution", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "refund", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

const PROGRAM_STATES = ["Active", "Executing", "Completed", "Cancelled"] as const;
const CROWDFUNDING_STATES = ["Unfunded", "Funded", "Withdrawn", "Cancelled"] as const;
const DISTRIBUTION_STATES = ["Draft", "Ready", "Distributed"] as const;

const STATE_COLORS: Record<string, string> = {
  Active: "badge-success",
  Executing: "badge-warning",
  Completed: "badge-info",
  Cancelled: "badge-error",
  Unfunded: "badge-warning",
  Funded: "badge-success",
  Withdrawn: "badge-info",
  Draft: "badge-ghost",
  Ready: "badge-success",
  Distributed: "badge-info",
};

type TokenTypeInfo = {
  tokenId: bigint;
  name: string;
  symbol: string;
  maxSupply: bigint;
  totalMinted: bigint;
  uri: string;
  transferable: boolean;
  burnable: boolean;
};

type CrowdfundingInfo = {
  addr: Address;
  fundingTarget: bigint;
  deadline: bigint;
  state: number;
  totalRaised: bigint;
};

type DistributionInfo = {
  addr: Address;
  tokenId: bigint;
  state: number;
  beneficiaryCount: bigint;
  totalRequired: bigint;
  beneficiaries: Address[];
  amounts: bigint[];
};

type BeneficiaryEntry = {
  id: string;
  address: string;
  amount: string;
};

function useContractRead<T>(address: Address, functionName: string, args?: readonly unknown[]) {
  const result = useReadContract({
    address,
    abi: cgProgramAbi,
    functionName: functionName as any,
    args: args as any,
    query: { refetchInterval: 5000 },
  });
  return { ...result, data: result.data as T | undefined };
}

function useCGProgramWrite(programAddress: Address, orgAddress: Address | undefined) {
  const { write: sponsoredWrite } = useSponsoredWrite(orgAddress);

  return async (functionName: string, args?: readonly unknown[], value?: bigint) => {
    return sponsoredWrite({
      address: programAddress,
      abi: cgProgramAbi,
      functionName,
      args,
      value,
    });
  };
}

function validateBeneficiaries(entries: BeneficiaryEntry[]): { addresses: Address[]; amounts: bigint[] } | null {
  const nonEmpty = entries.filter(e => e.address || e.amount);
  if (nonEmpty.length === 0) {
    notification.error("Add at least one beneficiary");
    return null;
  }
  for (let i = 0; i < nonEmpty.length; i++) {
    if (!isAddress(nonEmpty[i].address)) {
      notification.error(`Row ${i + 1}: invalid address`);
      return null;
    }
    if (!nonEmpty[i].amount || Number(nonEmpty[i].amount) <= 0 || !Number.isInteger(Number(nonEmpty[i].amount))) {
      notification.error(`Row ${i + 1}: amount must be a positive integer`);
      return null;
    }
  }
  return {
    addresses: nonEmpty.map(e => e.address as Address),
    amounts: nonEmpty.map(e => BigInt(e.amount)),
  };
}

export const CGProgramView = ({ address }: { address: Address }) => {
  const { address: connectedAddress } = useAccount();
  const { orgAddress } = useProgramOrganization(address);

  const { data: name, isLoading: nameLoading, error: nameError } = useContractRead<string>(address, "name");
  const { data: state } = useContractRead<number>(address, "state");
  const { data: owner } = useContractRead<Address>(address, "owner");
  const { data: lockDistributions } = useContractRead<boolean>(address, "lockDistributions");
  const { data: tokenAddress } = useContractRead<Address>(address, "token");
  const { data: tokenTypes } = useContractRead<TokenTypeInfo[]>(address, "getTokenTypes");
  const { data: crowdfundingInfo } = useContractRead<CrowdfundingInfo>(address, "getCrowdfundingInfo");
  const { data: distributionsInfo } = useContractRead<DistributionInfo[]>(address, "getAllDistributionsInfo");

  const isOwner = connectedAddress && owner ? isAddressEqual(connectedAddress, owner) : false;
  const programState = PROGRAM_STATES[state ?? 0];
  const isActive = state === 0;

  if (nameLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (nameError) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-error text-lg">Failed to load program data.</p>
          <p className="text-sm opacity-60 mt-2">This address may not be a valid CGProgram contract.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-8 max-w-5xl mx-auto">
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <ProgramSection
            address={address}
            name={name}
            programState={programState}
            owner={owner}
            lockDistributions={lockDistributions}
            isOwner={isOwner}
            orgAddress={orgAddress}
          />
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <CrowdfundingSection
            crowdfundingInfo={crowdfundingInfo}
            programAddress={address}
            isActive={isActive}
            isOwner={isOwner}
            lockDistributions={lockDistributions}
            distributions={distributionsInfo ?? []}
            connectedAddress={connectedAddress}
            orgAddress={orgAddress}
          />
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body flex flex-col gap-6">
          <TokenSection
            tokenAddress={tokenAddress}
            tokenTypes={tokenTypes ?? []}
            programAddress={address}
            isOwner={isOwner}
            isActive={isActive}
            orgAddress={orgAddress}
          />
          <DistributionsSection
            distributions={distributionsInfo ?? []}
            tokenTypes={tokenTypes ?? []}
            programAddress={address}
            isActive={isActive}
            isOwner={isOwner}
            crowdfundingHasContributions={
              crowdfundingInfo != null &&
              !isAddressEqual(crowdfundingInfo.addr, zeroAddress) &&
              crowdfundingInfo.totalRaised > 0n
            }
            orgAddress={orgAddress}
          />
          {isOwner && isActive && (
            <OwnerActions
              address={address}
              crowdfundingInfo={crowdfundingInfo}
              distributions={distributionsInfo ?? []}
              orgAddress={orgAddress}
            />
          )}
        </div>
      </div>
    </div>
  );
};

function ProgramSection({
  address,
  name,
  programState,
  owner,
  lockDistributions,
  isOwner,
  orgAddress,
}: {
  address: Address;
  name: string | undefined;
  programState: string;
  owner: Address | undefined;
  lockDistributions: boolean | undefined;
  isOwner: boolean;
  orgAddress: Address | undefined;
}) {
  const addressLink = useBlockExplorerLink(address);
  const ownerLink = useBlockExplorerLink(owner);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title text-3xl">{name || "CGProgram"}</h2>
        <div className="flex items-center gap-2">
          {orgAddress && <OrgGasSponsorshipBadge orgAddress={orgAddress} />}
          <span className={`badge ${STATE_COLORS[programState]} badge-lg`}>{programState}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm opacity-60">Program Address</p>
          <AddressDisplay address={address} format="long" blockExplorerAddressLink={addressLink} />
        </div>
        <div>
          <p className="text-sm opacity-60">Program Owner</p>
          <div className="flex items-center gap-2">
            {owner && <AddressDisplay address={owner} blockExplorerAddressLink={ownerLink} />}
            {isOwner && <span className="badge badge-info badge-sm">You</span>}
          </div>
        </div>
        <div>
          <p className="text-sm opacity-60">Contract Balance</p>
          <Balance address={address} />
        </div>
        <div>
          <p className="text-sm flex items-center gap-1">
            <span className="opacity-60">Distributions Locked</span>
            <span
              className="tooltip tooltip-bottom"
              data-tip="When locked, all distributions must marked as Ready before the crowdfunding can accept contributions. This guarantees contributors know exactly how funds will be allocated."
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="w-4 h-4 stroke-current cursor-help"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
          </p>
          <p className="font-mono">{lockDistributions ? "Yes" : "No"}</p>
        </div>
      </div>
    </>
  );
}

function TokenSection({
  tokenAddress,
  tokenTypes,
  programAddress,
  isOwner,
  isActive,
  orgAddress,
}: {
  tokenAddress: Address | undefined;
  tokenTypes: TokenTypeInfo[];
  programAddress: Address;
  isOwner: boolean;
  isActive: boolean;
  orgAddress: Address | undefined;
}) {
  const tokenLink = useBlockExplorerLink(tokenAddress);
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (!tokenAddress || isAddressEqual(tokenAddress, zeroAddress)) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="card-title">Token Contract (ERC-1155)</h3>
        <a href={`/token/${tokenAddress}`} className="btn btn-sm btn-outline">
          View &amp; Spend Tokens
        </a>
      </div>
      <div>
        <p className="text-sm opacity-60">Token Address</p>
        <AddressDisplay address={tokenAddress} blockExplorerAddressLink={tokenLink} />
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-sm opacity-60">Token Types ({tokenTypes.length})</p>
        {isOwner && isActive && !showCreateForm && (
          <button className="btn btn-sm btn-secondary" onClick={() => setShowCreateForm(true)}>
            + Create Token Type
          </button>
        )}
      </div>

      {showCreateForm && (
        <CreateTokenTypeForm
          programAddress={programAddress}
          orgAddress={orgAddress}
          onDone={() => setShowCreateForm(false)}
        />
      )}

      {tokenTypes.length === 0 && !showCreateForm ? (
        <p className="opacity-60 text-sm">No token types defined yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tokenTypes.map(tt => (
            <div key={tt.tokenId.toString()} className="border border-base-300 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-outline badge-sm">#{tt.tokenId.toString()}</span>
                <span className="font-semibold">
                  {tt.name} ({tt.symbol})
                </span>
                <span className="badge badge-ghost badge-sm">
                  {tt.maxSupply === 0n ? "Fungible" : tt.maxSupply === 1n ? "NFT (max 1)" : `Max ${tt.maxSupply}`}
                </span>
              </div>
              <div className="flex gap-4 text-xs opacity-70">
                <span>Minted: {tt.totalMinted.toString()}</span>
                {tt.uri && <span>URI: {tt.uri}</span>}
              </div>
              <div className="flex gap-2 mt-1">
                <span className={`badge badge-xs ${tt.transferable ? "badge-success" : "badge-error"}`}>
                  {tt.transferable ? "Transferable" : "Non-transferable"}
                </span>
                <span className={`badge badge-xs ${tt.burnable ? "badge-success" : "badge-error"}`}>
                  {tt.burnable ? "Burnable" : "Non-burnable"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CrowdfundingSection({
  crowdfundingInfo,
  programAddress,
  isActive,
  isOwner,
  lockDistributions,
  distributions,
  connectedAddress,
  orgAddress,
}: {
  crowdfundingInfo: CrowdfundingInfo | undefined;
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
  lockDistributions: boolean | undefined;
  distributions: DistributionInfo[];
  connectedAddress: Address | undefined;
  orgAddress: Address | undefined;
}) {
  const [contributeAmount, setContributeAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const cfLink = useBlockExplorerLink(crowdfundingInfo?.addr);
  const { write: sponsoredWrite } = useSponsoredWrite(orgAddress);

  const cfAddr = crowdfundingInfo?.addr;
  const isValidCf = cfAddr && !isAddressEqual(cfAddr, zeroAddress);

  const { data: userContribution, refetch: refetchUserContribution } = useReadContract({
    address: isValidCf ? cfAddr : undefined,
    abi: cgCrowdfundingAbi,
    functionName: "contributions",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!isValidCf && !!connectedAddress, refetchInterval: 5000 },
  });

  const writeCf = async (functionName: "cancelContribution" | "refund") => {
    if (!cfAddr || isPending) return;
    setIsPending(true);
    try {
      const success = await sponsoredWrite({
        address: cfAddr,
        abi: cgCrowdfundingAbi,
        functionName,
      });
      if (success) refetchUserContribution();
    } finally {
      setIsPending(false);
    }
  };

  const isZeroAddr = !crowdfundingInfo || isAddressEqual(crowdfundingInfo.addr, zeroAddress);

  if (isZeroAddr) {
    return (
      <div>
        <h3 className="card-title">Crowdfunding</h3>
        <p className="opacity-60">No crowdfunding configured for this program.</p>
        {isOwner && isActive && <SetCrowdfundingForm programAddress={programAddress} orgAddress={orgAddress} />}
      </div>
    );
  }

  const cfState = CROWDFUNDING_STATES[crowdfundingInfo.state] ?? "Unknown";
  const deadline = new Date(Number(crowdfundingInfo.deadline) * 1000);
  const progress =
    crowdfundingInfo.fundingTarget > 0n
      ? Number((crowdfundingInfo.totalRaised * 10000n) / crowdfundingInfo.fundingTarget) / 100
      : 0;

  const allDistributionsReady = distributions.length > 0 && distributions.every(d => d.state === 1);
  const contributeLocked = lockDistributions && !allDistributionsReady;

  const handleContribute = async () => {
    if (!contributeAmount || isPending) return;
    setIsPending(true);
    try {
      const success = await sponsoredWrite({
        address: programAddress,
        abi: cgProgramAbi,
        functionName: "contribute",
        value: parseEther(contributeAmount),
      });
      if (success) setContributeAmount("");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="card-title">Crowdfunding</h3>
        <span className={`badge ${STATE_COLORS[cfState]}`}>{cfState}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div>
          <p className="text-sm opacity-60">Contract Address</p>
          <AddressDisplay address={crowdfundingInfo.addr} blockExplorerAddressLink={cfLink} />
        </div>
        <div>
          <p className="text-sm opacity-60">Funding Target</p>
          <p className="font-mono">{formatEther(crowdfundingInfo.fundingTarget)} ETH</p>
        </div>
        <div>
          <p className="text-sm opacity-60">Total Raised</p>
          <p className="font-mono">{formatEther(crowdfundingInfo.totalRaised)} ETH</p>
        </div>
        <div>
          <p className="text-sm opacity-60">Deadline</p>
          <p className="font-mono">{deadline.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Progress</span>
          <span>{Math.min(progress, 100).toFixed(1)}%</span>
        </div>
        <progress className="progress progress-primary w-full" value={Math.min(progress, 100)} max="100" />
      </div>

      {connectedAddress && userContribution !== undefined && userContribution > 0n && (
        <div className="mt-4 p-4 rounded-xl bg-base-200 border border-base-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-0.5">Your contribution</p>
              <p className="text-2xl font-bold font-mono">{formatEther(userContribution)} ETH</p>
            </div>
            <div className="flex gap-2">
              {crowdfundingInfo.state === 0 && (
                <button
                  className="btn btn-sm btn-outline btn-error"
                  disabled={isPending}
                  onClick={() => writeCf("cancelContribution")}
                >
                  {isPending ? <span className="loading loading-spinner loading-xs" /> : "Cancel contribution"}
                </button>
              )}
              {crowdfundingInfo.state === 3 && (
                <button className="btn btn-sm btn-warning" disabled={isPending} onClick={() => writeCf("refund")}>
                  {isPending ? <span className="loading loading-spinner loading-xs" /> : "Claim refund"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {crowdfundingInfo.state === 3 && connectedAddress && userContribution === 0n && (
        <div className="mt-4 p-3 rounded-xl bg-base-200 border border-base-300 text-sm opacity-60 text-center">
          This program was cancelled. You have no contribution to refund.
        </div>
      )}

      {crowdfundingInfo.state === 0 && (
        <div className="mt-4">
          {contributeLocked && (
            <div role="alert" className="alert alert-warning mb-3 py-2 text-sm">
              <WarningIcon />
              <span>
                Contributions are locked until all distributions are defined and marked as &quot;Ready&quot; by the
                program owner.
              </span>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="grow">
              <label className="label">
                <span className="label-text">Contribute ETH</span>
              </label>
              <EtherInput onValueChange={({ valueInEth }) => setContributeAmount(valueInEth)} />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleContribute}
              disabled={!contributeAmount || !!contributeLocked || isPending}
            >
              {isPending ? <span className="loading loading-spinner loading-xs" /> : "Contribute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SetCrowdfundingForm({
  programAddress,
  orgAddress,
}: {
  programAddress: Address;
  orgAddress: Address | undefined;
}) {
  const [target, setTarget] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const write = useCGProgramWrite(programAddress, orgAddress);

  const handleSet = async () => {
    if (!target || !deadlineDays) return;
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86400);
    const success = await write("setCrowdfunding", [parseEther(target), deadlineTimestamp]);
    if (success) {
      setTarget("");
      setDeadlineDays("");
    }
  };

  return (
    <div className="mt-4 border-t border-base-300 pt-4">
      <p className="font-semibold mb-2">Set Crowdfunding</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="grow">
          <label className="label">
            <span className="label-text">Target (ETH)</span>
          </label>
          <EtherInput onValueChange={({ valueInEth }) => setTarget(valueInEth)} />
        </div>
        <div className="grow">
          <label className="label">
            <span className="label-text">Deadline (days from now)</span>
          </label>
          <input
            type="number"
            className="input input-bordered w-full"
            value={deadlineDays}
            onChange={e => setDeadlineDays(e.target.value)}
            placeholder="30"
          />
        </div>
        <div className="flex items-end">
          <button className="btn btn-secondary" onClick={handleSet} disabled={!target || !deadlineDays}>
            Set
          </button>
        </div>
      </div>
    </div>
  );
}

function DistributionsSection({
  distributions,
  tokenTypes,
  programAddress,
  isActive,
  isOwner,
  crowdfundingHasContributions,
  orgAddress,
}: {
  distributions: DistributionInfo[];
  tokenTypes: TokenTypeInfo[];
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
  crowdfundingHasContributions: boolean;
  orgAddress: Address | undefined;
}) {
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="card-title">Distributions ({distributions.length})</h3>
        {isOwner && isActive && !showNewForm && tokenTypes.length > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => setShowNewForm(true)}>
            + New Distribution
          </button>
        )}
      </div>

      {isOwner && isActive && tokenTypes.length === 0 && (
        <p className="text-sm opacity-60 mt-2">Create at least one token type above before creating distributions.</p>
      )}

      {showNewForm && (
        <NewDistributionForm
          programAddress={programAddress}
          nextIndex={distributions.length}
          tokenTypes={tokenTypes}
          onDone={() => setShowNewForm(false)}
          orgAddress={orgAddress}
        />
      )}

      {distributions.length === 0 && !showNewForm ? (
        <p className="opacity-60 mt-2">No distributions yet.</p>
      ) : (
        <div className="flex flex-col gap-4 mt-2">
          {distributions.map((dist, i) => {
            const distState = DISTRIBUTION_STATES[dist.state] ?? "Unknown";
            const tokenType = tokenTypes.find(tt => tt.tokenId === dist.tokenId);
            return (
              <DistributionItem
                key={i}
                dist={dist}
                index={i}
                distState={distState}
                tokenType={tokenType}
                programAddress={programAddress}
                isActive={isActive}
                isOwner={isOwner}
                crowdfundingHasContributions={crowdfundingHasContributions}
                orgAddress={orgAddress}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewDistributionForm({
  programAddress,
  nextIndex,
  tokenTypes,
  onDone,
  orgAddress,
}: {
  programAddress: Address;
  nextIndex: number;
  tokenTypes: TokenTypeInfo[];
  onDone: () => void;
  orgAddress: Address | undefined;
}) {
  const [entries, setEntries] = useState<BeneficiaryEntry[]>([{ id: crypto.randomUUID(), address: "", amount: "" }]);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint>(tokenTypes[0]?.tokenId ?? 0n);
  const [isPending, setIsPending] = useState(false);
  const write = useCGProgramWrite(programAddress, orgAddress);

  const selectedTokenType = tokenTypes.find(tt => tt.tokenId === selectedTokenId);
  const isNft = selectedTokenType?.maxSupply === 1n;

  const handleCreate = async () => {
    const finalEntries = isNft ? entries.map(e => ({ ...e, amount: "1" })) : entries;
    const validated = validateBeneficiaries(finalEntries);
    if (!validated) return;

    setIsPending(true);
    try {
      const created = await write("createDistribution", [selectedTokenId]);
      if (!created) return;
      await write("setBeneficiaries", [BigInt(nextIndex), validated.addresses, validated.amounts]);
      notification.success("Distribution created with beneficiaries");
      onDone();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="border border-secondary rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold">New Distribution</span>
        <button className="btn btn-sm btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>

      <div className="mb-3">
        <label className="label">
          <span className="label-text">Token Type</span>
        </label>
        <select
          className="select select-bordered w-full max-w-xs"
          value={selectedTokenId.toString()}
          onChange={e => setSelectedTokenId(BigInt(e.target.value))}
        >
          {tokenTypes.map(tt => (
            <option key={tt.tokenId.toString()} value={tt.tokenId.toString()}>
              #{tt.tokenId.toString()} — {tt.name} ({tt.symbol}){" "}
              {tt.maxSupply === 0n ? "" : tt.maxSupply === 1n ? "· NFT" : `· Max ${tt.maxSupply}`}
            </option>
          ))}
        </select>
      </div>

      <BeneficiariesTableEditor entries={entries} onChange={setEntries} hideAmount={isNft} />
      <div className="mt-3">
        <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={isPending}>
          {isPending ? <span className="loading loading-spinner loading-xs" /> : "Create Distribution"}
        </button>
      </div>
    </div>
  );
}

function DistributionItem({
  dist,
  index,
  distState,
  tokenType,
  programAddress,
  isActive,
  isOwner,
  crowdfundingHasContributions,
  orgAddress,
}: {
  dist: DistributionInfo;
  index: number;
  distState: string;
  tokenType: TokenTypeInfo | undefined;
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
  crowdfundingHasContributions: boolean;
  orgAddress: Address | undefined;
}) {
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editMode, setEditMode] = useState<"none" | "set" | "add" | "remove">("none");
  const write = useCGProgramWrite(programAddress, orgAddress);
  const distLink = useBlockExplorerLink(dist.addr);

  const deleteDisabledReason =
    crowdfundingHasContributions && dist.state !== 0
      ? "Crowdfunding has started — distributions cannot be removed"
      : null;

  const handleLockConfirm = async () => {
    const success = await write("markDistributionReady", [BigInt(index)]);
    if (success) setShowLockConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    const success = await write("deleteDistribution", [BigInt(index)]);
    if (success) setShowDeleteConfirm(false);
  };

  return (
    <div className="border border-base-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Distribution #{index}</span>
          {tokenType && (
            <span className="badge badge-outline badge-sm">
              {tokenType.name} ({tokenType.symbol})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${STATE_COLORS[distState] ?? "badge-ghost"}`}>{distState}</span>
          {isOwner && isActive && dist.state !== 2 && (
            <div className="tooltip tooltip-left" data-tip={deleteDisabledReason ?? "Delete distribution"}>
              <button
                className="btn btn-ghost btn-xs text-error"
                disabled={deleteDisabledReason !== null}
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="Delete distribution"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <p className="opacity-60">Contract Address</p>
          <AddressDisplay address={dist.addr} blockExplorerAddressLink={distLink} />
        </div>
        {tokenType?.maxSupply !== 1n && (
          <div>
            <p className="opacity-60">Total Required</p>
            <p className="font-mono">{dist.totalRequired.toString()} tokens</p>
          </div>
        )}
      </div>

      {dist.beneficiaries.length > 0 && editMode !== "set" && editMode !== "remove" && (
        <div className="mt-3">
          <p className="text-sm opacity-60 mb-1">Beneficiaries ({dist.beneficiaryCount.toString()})</p>
          <BeneficiariesReadTable beneficiaries={dist.beneficiaries} amounts={dist.amounts} />
        </div>
      )}

      {isOwner && isActive && dist.state !== 2 && (
        <div className="mt-3">
          {editMode === "none" ? (
            <div className="flex gap-2 flex-wrap">
              {dist.state === 0 && (
                <>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditMode("add")}>
                    + Add
                  </button>
                  {dist.beneficiaryCount > 0n && (
                    <>
                      <button className="btn btn-sm btn-outline btn-error" onClick={() => setEditMode("remove")}>
                        - Remove
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => setEditMode("set")}>
                        Replace All
                      </button>
                      <button className="btn btn-sm btn-accent" onClick={() => setShowLockConfirm(true)}>
                        Confirm and Lock Beneficiary List
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : editMode === "set" ? (
            <EditBeneficiariesForm
              programAddress={programAddress}
              distributionIndex={index}
              tokenType={tokenType}
              existingBeneficiaries={dist.beneficiaries}
              existingAmounts={dist.amounts}
              onClose={() => setEditMode("none")}
              orgAddress={orgAddress}
            />
          ) : editMode === "add" ? (
            <AddBeneficiariesForm
              programAddress={programAddress}
              distributionIndex={index}
              tokenType={tokenType}
              onClose={() => setEditMode("none")}
              orgAddress={orgAddress}
            />
          ) : editMode === "remove" ? (
            <RemoveBeneficiariesPanel
              programAddress={programAddress}
              distributionIndex={index}
              beneficiaries={dist.beneficiaries}
              amounts={dist.amounts}
              onClose={() => setEditMode("none")}
              orgAddress={orgAddress}
            />
          ) : null}
        </div>
      )}

      {/* Lock confirmation modal */}
      {showLockConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Lock Beneficiary List</h3>
            <p className="py-4">
              This will permanently lock the beneficiary list for Distribution #{index}. This action cannot be undone.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowLockConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-accent" onClick={handleLockConfirm}>
                Confirm and Lock
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowLockConfirm(false)} />
        </div>
      )}

      {/* Delete distribution confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Distribution</h3>
            <p className="py-4">
              Are you sure you want to delete Distribution #{index}? It will be permanently removed from the program.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>
                Go Back
              </button>
              <button className="btn btn-error" onClick={handleDeleteConfirm}>
                Delete Distribution
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(false)} />
        </div>
      )}
    </div>
  );
}

function BeneficiariesReadTable({ beneficiaries, amounts }: { beneficiaries: Address[]; amounts: bigint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs">
        <thead>
          <tr>
            <th>Account</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {beneficiaries.map((b, j) => (
            <BeneficiaryRow key={b} address={b} amount={amounts[j]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BeneficiaryRow({ address, amount }: { address: Address; amount: bigint }) {
  const link = useBlockExplorerLink(address);
  return (
    <tr>
      <td>
        <AddressDisplay address={address} blockExplorerAddressLink={link} />
      </td>
      <td className="font-mono">{amount.toString()} tokens</td>
    </tr>
  );
}

function WarningIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

function BeneficiariesTableEditor({
  entries,
  onChange,
  hideAmount = false,
}: {
  entries: BeneficiaryEntry[];
  onChange: (entries: BeneficiaryEntry[]) => void;
  hideAmount?: boolean;
}) {
  const updateEntry = (index: number, field: keyof BeneficiaryEntry, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addRow = () => onChange([...entries, { id: crypto.randomUUID(), address: "", amount: "" }]);

  const removeRow = (index: number) => onChange(entries.filter((_, i) => i !== index));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className={hideAmount ? "w-11/12" : "w-7/12"}>Account</th>
              {!hideAmount && <th className="w-4/12">Amount (tokens)</th>}
              <th className="w-1/12" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td>
                  <AddressInputWithQr
                    value={entry.address}
                    onChange={val => updateEntry(i, "address", val)}
                    placeholder="0x..."
                  />
                </td>
                {!hideAmount && (
                  <td>
                    <input
                      type="number"
                      className="input input-bordered input-sm w-full"
                      value={entry.amount}
                      onChange={e => updateEntry(i, "amount", e.target.value)}
                      placeholder="1"
                      min="1"
                      step="1"
                    />
                  </td>
                )}
                <td>
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => removeRow(i)}
                    disabled={entries.length <= 1}
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-ghost btn-xs mt-1" onClick={addRow}>
          + Add row
        </button>
      </div>
    </>
  );
}

function EditBeneficiariesForm({
  programAddress,
  distributionIndex,
  tokenType,
  existingBeneficiaries,
  existingAmounts,
  onClose,
  orgAddress,
}: {
  programAddress: Address;
  distributionIndex: number;
  tokenType: TokenTypeInfo | undefined;
  existingBeneficiaries: Address[];
  existingAmounts: bigint[];
  onClose: () => void;
  orgAddress: Address | undefined;
}) {
  const [entries, setEntries] = useState<BeneficiaryEntry[]>(() =>
    existingBeneficiaries.length > 0
      ? existingBeneficiaries.map((addr, i) => ({
          id: crypto.randomUUID(),
          address: addr,
          amount: existingAmounts[i]?.toString() ?? "1",
        }))
      : [{ id: crypto.randomUUID(), address: "", amount: "" }],
  );
  const write = useCGProgramWrite(programAddress, orgAddress);
  const isNft = tokenType?.maxSupply === 1n;

  const handleSet = async () => {
    const finalEntries = isNft ? entries.map(e => ({ ...e, amount: "1" })) : entries;
    const validated = validateBeneficiaries(finalEntries);
    if (!validated) return;

    const success = await write("setBeneficiaries", [
      BigInt(distributionIndex),
      validated.addresses,
      validated.amounts,
    ]);
    if (success) onClose();
  };

  return (
    <div className="flex flex-col gap-2 w-full border border-base-300 rounded-lg p-3">
      <p className="text-sm font-medium opacity-70">Replace entire beneficiary list</p>
      <BeneficiariesTableEditor entries={entries} onChange={setEntries} hideAmount={isNft} />
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={handleSet}>
          Confirm
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddBeneficiariesForm({
  programAddress,
  distributionIndex,
  tokenType,
  onClose,
  orgAddress,
}: {
  programAddress: Address;
  distributionIndex: number;
  tokenType: TokenTypeInfo | undefined;
  onClose: () => void;
  orgAddress: Address | undefined;
}) {
  const [entries, setEntries] = useState<BeneficiaryEntry[]>([{ id: crypto.randomUUID(), address: "", amount: "" }]);
  const write = useCGProgramWrite(programAddress, orgAddress);
  const isNft = tokenType?.maxSupply === 1n;

  const handleAdd = async () => {
    const finalEntries = isNft ? entries.map(e => ({ ...e, amount: "1" })) : entries;
    const validated = validateBeneficiaries(finalEntries);
    if (!validated) return;

    const success = await write("addBeneficiaries", [
      BigInt(distributionIndex),
      validated.addresses,
      validated.amounts,
    ]);
    if (success) onClose();
  };

  return (
    <div className="flex flex-col gap-2 w-full border border-base-300 rounded-lg p-3">
      <p className="text-sm font-medium">Add Beneficiaries</p>
      <BeneficiariesTableEditor entries={entries} onChange={setEntries} hideAmount={isNft} />
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={handleAdd}>
          Confirm
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RemoveBeneficiariesPanel({
  programAddress,
  distributionIndex,
  beneficiaries,
  amounts,
  onClose,
  orgAddress,
}: {
  programAddress: Address;
  distributionIndex: number;
  beneficiaries: Address[];
  amounts: bigint[];
  onClose: () => void;
  orgAddress: Address | undefined;
}) {
  const [selected, setSelected] = useState<Set<Address>>(new Set());
  const write = useCGProgramWrite(programAddress, orgAddress);

  const toggle = (addr: Address) => {
    const next = new Set(selected);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    setSelected(next);
  };

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(beneficiaries) : new Set());

  const handleRemove = async () => {
    if (selected.size === 0) return;
    const success = await write("removeBeneficiaries", [BigInt(distributionIndex), [...selected]]);
    if (success) onClose();
  };

  return (
    <div className="flex flex-col gap-2 w-full border border-error/30 rounded-lg p-3">
      <p className="text-sm font-medium">Select beneficiaries to remove</p>
      <div className="overflow-x-auto">
        <table className="table table-xs">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={selected.size === beneficiaries.length && beneficiaries.length > 0}
                  onChange={e => toggleAll(e.target.checked)}
                />
              </th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {beneficiaries.map((b, j) => (
              <RemovableRow
                key={b}
                address={b}
                amount={amounts[j]}
                checked={selected.has(b)}
                onToggle={() => toggle(b)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 items-center">
        <button className="btn btn-sm btn-error" onClick={handleRemove} disabled={selected.size === 0}>
          Remove{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RemovableRow({
  address,
  amount,
  checked,
  onToggle,
}: {
  address: Address;
  amount: bigint;
  checked: boolean;
  onToggle: () => void;
}) {
  const link = useBlockExplorerLink(address);
  return (
    <tr>
      <td>
        <input type="checkbox" className="checkbox checkbox-xs" checked={checked} onChange={onToggle} />
      </td>
      <td>
        <AddressDisplay address={address} blockExplorerAddressLink={link} />
      </td>
      <td className="font-mono">{amount.toString()} tokens</td>
    </tr>
  );
}

function getExecuteDisabledReason(
  crowdfundingInfo: CrowdfundingInfo | undefined,
  distributions: DistributionInfo[],
): string | null {
  const hasCrowdfunding = crowdfundingInfo && !isAddressEqual(crowdfundingInfo.addr, zeroAddress);
  if (!hasCrowdfunding) return "No crowdfunding configured";
  if (distributions.length === 0) return "No distributions created";
  if (crowdfundingInfo.state !== 1) return "Crowdfunding is not funded yet";

  const notReadyIndex = distributions.findIndex(d => d.state !== 1);
  if (notReadyIndex !== -1) return `Distribution #${notReadyIndex} is not ready`;

  return null;
}

function OwnerActions({
  address,
  crowdfundingInfo,
  distributions,
  orgAddress,
}: {
  address: Address;
  crowdfundingInfo: CrowdfundingInfo | undefined;
  distributions: DistributionInfo[];
  orgAddress: Address | undefined;
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [isPending, setIsPending] = useState(false);
  const write = useCGProgramWrite(address, orgAddress);

  const executeDisabledReason = getExecuteDisabledReason(crowdfundingInfo, distributions);
  const canExecute = executeDisabledReason === null;

  const handleCancelConfirm = async () => {
    setIsPending(true);
    const success = await write("cancel");
    setIsPending(false);
    if (success) setShowCancelConfirm(false);
  };

  const handleTransferConfirm = async () => {
    if (!isAddress(newOwner)) {
      notification.error("Invalid address");
      return;
    }
    setIsPending(true);
    const success = await write("transferOwnership", [newOwner]);
    setIsPending(false);
    if (success) {
      setShowTransferConfirm(false);
      setNewOwner("");
    }
  };

  return (
    <div>
      <div className="divider" />
      <h3 className="card-title">Owner Actions</h3>
      <div className="flex gap-3 mt-4">
        <div
          className="tooltip tooltip-bottom"
          data-tip={
            canExecute
              ? "Withdraw crowdfunded ETH to the owner and distribute tokens to all beneficiaries."
              : executeDisabledReason
          }
        >
          <button className="btn btn-primary" onClick={() => write("execute")} disabled={!canExecute}>
            Execute Program
          </button>
        </div>
        <div
          className="tooltip tooltip-bottom"
          data-tip="Permanently cancel the program. Contributors will be able to claim refunds."
        >
          <button className="btn btn-error" onClick={() => setShowCancelConfirm(true)}>
            Cancel Program
          </button>
        </div>
        <div>
          <button className="btn btn-warning" onClick={() => setShowTransferConfirm(true)}>
            Transfer Ownership
          </button>
        </div>
      </div>

      {/* Cancel program confirmation modal */}
      {showCancelConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Cancel Program</h3>
            <div role="alert" className="alert alert-error my-4 py-2 text-sm">
              <WarningIcon />
              <span>
                This will permanently cancel the program. Contributors will be able to claim refunds. This action cannot
                be undone.
              </span>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowCancelConfirm(false)} disabled={isPending}>
                Go Back
              </button>
              <button className="btn btn-error" onClick={handleCancelConfirm} disabled={isPending}>
                {isPending && <span className="loading loading-spinner loading-sm" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !isPending && setShowCancelConfirm(false)} />
        </div>
      )}

      {/* Transfer ownership confirmation modal */}
      {showTransferConfirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Transfer Ownership</h3>
            <div role="alert" className="alert alert-warning my-4 py-2 text-sm">
              <WarningIcon />
              <span>
                You will permanently lose control of this program. Make sure the new owner address is correct.
              </span>
            </div>
            <div>
              <label className="label">
                <span className="label-text">New Owner Address</span>
              </label>
              <AddressInputWithQr value={newOwner} onChange={setNewOwner} placeholder="0x..." />
            </div>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowTransferConfirm(false);
                  setNewOwner("");
                }}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={handleTransferConfirm}
                disabled={!isAddress(newOwner) || isPending}
              >
                {isPending && <span className="loading loading-spinner loading-sm" />}
                Transfer Ownership
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => {
              if (isPending) return;
              setShowTransferConfirm(false);
              setNewOwner("");
            }}
          />
        </div>
      )}
    </div>
  );
}

function CreateTokenTypeForm({
  programAddress,
  orgAddress,
  onDone,
}: {
  programAddress: Address;
  orgAddress: Address | undefined;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("");
  const [uri, setUri] = useState("");
  const [transferable, setTransferable] = useState(true);
  const [burnable, setBurnable] = useState(true);
  const write = useCGProgramWrite(programAddress, orgAddress);

  const handleCreate = async () => {
    if (!name || !symbol) {
      notification.error("Name and symbol are required");
      return;
    }
    const supply = maxSupply ? BigInt(maxSupply) : 0n;
    const success = await write("defineTokenType", [name, symbol, supply, uri, transferable, burnable]);
    if (success) {
      onDone();
      setName("");
      setSymbol("");
      setMaxSupply("");
      setUri("");
      setTransferable(true);
      setBurnable(true);
    }
  };

  return (
    <div className="border border-base-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold">Create Token Type</span>
        <button className="btn btn-sm btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">
            <span className="label-text">Name</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Voucher"
          />
        </div>
        <div>
          <label className="label">
            <span className="label-text">Symbol</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            placeholder="VOUCHER"
          />
        </div>
        <div>
          <label className="label">
            <span className="label-text">
              Max Supply{" "}
              <span className="opacity-60 text-xs">(0 = unlimited / fungible, 1 = unique NFT, N = capped)</span>
            </span>
          </label>
          <input
            type="number"
            className="input input-bordered w-full"
            value={maxSupply}
            onChange={e => setMaxSupply(e.target.value)}
            placeholder="0"
            min="0"
          />
        </div>
        <div>
          <label className="label">
            <span className="label-text">
              Metadata URI <span className="opacity-60 text-xs">(optional)</span>
            </span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={uri}
            onChange={e => setUri(e.target.value)}
            placeholder="ipfs://..."
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="label">
            <span className="label-text">Token Permissions</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={transferable}
              onChange={e => setTransferable(e.target.checked)}
            />
            <span className="label-text">
              Transferable
              <span className="opacity-60 text-xs ml-1">(holders can transfer to others)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={burnable}
              onChange={e => setBurnable(e.target.checked)}
            />
            <span className="label-text">
              Burnable
              <span className="opacity-60 text-xs ml-1">(holders can burn/redeem tokens)</span>
            </span>
          </label>
        </div>
      </div>
      <button className="btn btn-secondary btn-sm mt-3" onClick={handleCreate} disabled={!name || !symbol}>
        Create
      </button>
    </div>
  );
}
