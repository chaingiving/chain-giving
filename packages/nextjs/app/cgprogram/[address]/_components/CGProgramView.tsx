"use client";

import { useState } from "react";
import { Address as AddressDisplay, AddressInput, Balance, EtherInput } from "@scaffold-ui/components";
import { Address, formatEther, isAddress, isAddressEqual, parseEther, zeroAddress } from "viem";
import { hardhat } from "viem/chains";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useTargetNetwork, useTransactor } from "~~/hooks/scaffold-eth";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

const cgProgramAbi = deployedContracts[31337].CGProgram.abi;

const PROGRAM_STATES = ["Active", "Executing", "Completed", "Cancelled"] as const;
const CROWDFUNDING_STATES = ["Unfunded", "Funded", "Withdrawn", "Cancelled"] as const;
const DISTRIBUTION_STATES = ["Inactive", "Ready", "Distributed"] as const;

const STATE_COLORS: Record<string, string> = {
  Active: "badge-success",
  Executing: "badge-warning",
  Completed: "badge-info",
  Cancelled: "badge-error",
  Unfunded: "badge-warning",
  Funded: "badge-success",
  Withdrawn: "badge-info",
  Inactive: "badge-ghost",
  Ready: "badge-success",
  Distributed: "badge-info",
};

type TokenInfo = {
  addr: Address;
  name: string;
  symbol: string;
  totalSupply: bigint;
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
  state: number;
  beneficiaryCount: bigint;
  totalRequired: bigint;
  beneficiaries: Address[];
  amounts: bigint[];
};

type BeneficiaryEntry = {
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

function useCGProgramWrite(programAddress: Address) {
  const { writeContractAsync } = useWriteContract();
  const writeTx = useTransactor();

  return async (functionName: string, args?: readonly unknown[], value?: bigint) => {
    try {
      await writeTx(() =>
        writeContractAsync({
          address: programAddress,
          abi: cgProgramAbi,
          functionName: functionName as any,
          args: args as any,
          value: value as any,
        } as any),
      );
      return true;
    } catch (e) {
      notification.error(getParsedError(e));
      return false;
    }
  };
}

function useBlockExplorerLink(address: Address | undefined) {
  const { targetNetwork } = useTargetNetwork();
  if (!address || targetNetwork.id !== hardhat.id) return undefined;
  return `/blockexplorer/address/${address}`;
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
    if (!nonEmpty[i].amount || Number(nonEmpty[i].amount) <= 0) {
      notification.error(`Row ${i + 1}: invalid amount`);
      return null;
    }
  }
  return {
    addresses: nonEmpty.map(e => e.address as Address),
    amounts: nonEmpty.map(e => parseEther(e.amount)),
  };
}

export const CGProgramView = ({ address }: { address: Address }) => {
  const { address: connectedAddress } = useAccount();

  const { data: name, isLoading: nameLoading, error: nameError } = useContractRead<string>(address, "name");
  const { data: state } = useContractRead<number>(address, "state");
  const { data: owner } = useContractRead<Address>(address, "owner");
  const { data: lockDistributions } = useContractRead<boolean>(address, "lockDistributions");
  const { data: tokenInfo } = useContractRead<TokenInfo>(address, "getTokenInfo");
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
          />
          <TokenSection tokenInfo={tokenInfo} />
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body flex flex-col gap-6">
          <CrowdfundingSection
            crowdfundingInfo={crowdfundingInfo}
            programAddress={address}
            isActive={isActive}
            isOwner={isOwner}
            lockDistributions={lockDistributions}
            distributions={distributionsInfo ?? []}
          />
          <DistributionsSection
            distributions={distributionsInfo ?? []}
            programAddress={address}
            isActive={isActive}
            isOwner={isOwner}
          />
          {isOwner && isActive && (
            <OwnerActions
              address={address}
              crowdfundingInfo={crowdfundingInfo}
              distributions={distributionsInfo ?? []}
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
}: {
  address: Address;
  name: string | undefined;
  programState: string;
  owner: Address | undefined;
  lockDistributions: boolean | undefined;
}) {
  const addressLink = useBlockExplorerLink(address);
  const ownerLink = useBlockExplorerLink(owner);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title text-3xl">{name || "CGProgram"}</h2>
        <span className={`badge ${STATE_COLORS[programState]} badge-lg`}>{programState}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm opacity-60">Contract Address</p>
          <AddressDisplay address={address} format="long" blockExplorerAddressLink={addressLink} />
        </div>
        <div>
          <p className="text-sm opacity-60">Owner</p>
          {owner && <AddressDisplay address={owner} blockExplorerAddressLink={ownerLink} />}
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

function TokenSection({ tokenInfo }: { tokenInfo: TokenInfo | undefined }) {
  const tokenLink = useBlockExplorerLink(tokenInfo?.addr);

  if (!tokenInfo) return null;

  return (
    <>
      <div className="divider" />
      <h3 className="card-title">Token</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm opacity-60">Name</p>
          <p className="font-semibold">
            {tokenInfo.name} ({tokenInfo.symbol})
          </p>
        </div>
        <div>
          <p className="text-sm opacity-60">Total Supply</p>
          <p className="font-mono">{formatEther(tokenInfo.totalSupply)} tokens</p>
        </div>
        <div>
          <p className="text-sm opacity-60">Token Address</p>
          <AddressDisplay address={tokenInfo.addr} blockExplorerAddressLink={tokenLink} />
        </div>
      </div>
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
}: {
  crowdfundingInfo: CrowdfundingInfo | undefined;
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
  lockDistributions: boolean | undefined;
  distributions: DistributionInfo[];
}) {
  const [contributeAmount, setContributeAmount] = useState("");
  const write = useCGProgramWrite(programAddress);
  const cfLink = useBlockExplorerLink(crowdfundingInfo?.addr);

  const isZeroAddr = !crowdfundingInfo || isAddressEqual(crowdfundingInfo.addr, zeroAddress);

  if (isZeroAddr) {
    return (
      <div>
        <h3 className="card-title">Crowdfunding</h3>
        <p className="opacity-60">No crowdfunding configured for this program.</p>
        {isOwner && isActive && <SetCrowdfundingForm programAddress={programAddress} />}
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
    if (!contributeAmount) return;
    const success = await write("contribute", undefined, parseEther(contributeAmount));
    if (success) setContributeAmount("");
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="card-title">Crowdfunding</h3>
        <span className={`badge ${STATE_COLORS[cfState]}`}>{cfState}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div>
          <p className="text-sm opacity-60">Address</p>
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

      {crowdfundingInfo.state === 0 && (
        <div className="mt-4">
          {contributeLocked && (
            <div role="alert" className="alert alert-warning mb-3 py-2 text-sm">
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
              disabled={!contributeAmount || !!contributeLocked}
            >
              Contribute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SetCrowdfundingForm({ programAddress }: { programAddress: Address }) {
  const [target, setTarget] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const write = useCGProgramWrite(programAddress);

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
  programAddress,
  isActive,
  isOwner,
}: {
  distributions: DistributionInfo[];
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
}) {
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div>
      <div className="divider" />
      <div className="flex items-center justify-between">
        <h3 className="card-title">Distributions ({distributions.length})</h3>
        {isOwner && isActive && !showNewForm && (
          <button className="btn btn-sm btn-secondary" onClick={() => setShowNewForm(true)}>
            + New Distribution
          </button>
        )}
      </div>

      {showNewForm && (
        <NewDistributionForm
          programAddress={programAddress}
          nextIndex={distributions.length}
          onDone={() => setShowNewForm(false)}
        />
      )}

      {distributions.length === 0 && !showNewForm ? (
        <p className="opacity-60 mt-2">No distributions yet.</p>
      ) : (
        <div className="flex flex-col gap-4 mt-2">
          {distributions.map((dist, i) => {
            const distState = DISTRIBUTION_STATES[dist.state] ?? "Unknown";
            return (
              <DistributionItem
                key={i}
                dist={dist}
                index={i}
                distState={distState}
                programAddress={programAddress}
                isActive={isActive}
                isOwner={isOwner}
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
  onDone,
}: {
  programAddress: Address;
  nextIndex: number;
  onDone: () => void;
}) {
  const [entries, setEntries] = useState<BeneficiaryEntry[]>([{ address: "", amount: "" }]);
  const [isPending, setIsPending] = useState(false);
  const write = useCGProgramWrite(programAddress);

  const handleCreate = async () => {
    const validated = validateBeneficiaries(entries);
    if (!validated) return;

    setIsPending(true);
    try {
      const created = await write("createDistribution");
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
      <BeneficiariesTableEditor entries={entries} onChange={setEntries} />
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
  programAddress,
  isActive,
  isOwner,
}: {
  dist: DistributionInfo;
  index: number;
  distState: string;
  programAddress: Address;
  isActive: boolean;
  isOwner: boolean;
}) {
  const write = useCGProgramWrite(programAddress);
  const distLink = useBlockExplorerLink(dist.addr);

  return (
    <div className="border border-base-300 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Distribution #{index}</span>
        <span className={`badge ${STATE_COLORS[distState]}`}>{distState}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <p className="opacity-60">Address</p>
          <AddressDisplay address={dist.addr} blockExplorerAddressLink={distLink} />
        </div>
        <div>
          <p className="opacity-60">Total Required</p>
          <p className="font-mono">{formatEther(dist.totalRequired)} tokens</p>
        </div>
      </div>

      {dist.beneficiaries.length > 0 && (
        <div className="mt-3">
          <p className="text-sm opacity-60 mb-1">Beneficiaries ({dist.beneficiaryCount.toString()})</p>
          <BeneficiariesReadTable beneficiaries={dist.beneficiaries} amounts={dist.amounts} />
        </div>
      )}

      {isOwner && isActive && dist.state === 0 && (
        <div className="mt-3 flex gap-2">
          <EditBeneficiariesForm programAddress={programAddress} distributionIndex={index} />
          {dist.beneficiaryCount > 0n && (
            <button className="btn btn-sm btn-accent" onClick={() => write("markDistributionReady", [BigInt(index)])}>
              Mark Ready
            </button>
          )}
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
            <th>Address</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {beneficiaries.map((b, j) => (
            <BeneficiaryRow key={j} address={b} amount={amounts[j]} />
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
      <td className="font-mono">{formatEther(amount)} tokens</td>
    </tr>
  );
}

function BeneficiariesTableEditor({
  entries,
  onChange,
}: {
  entries: BeneficiaryEntry[];
  onChange: (entries: BeneficiaryEntry[]) => void;
}) {
  const updateEntry = (index: number, field: keyof BeneficiaryEntry, value: string) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addRow = () => onChange([...entries, { address: "", amount: "" }]);

  const removeRow = (index: number) => {
    if (entries.length <= 1) return;
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th className="w-7/12">Address</th>
            <th className="w-4/12">Amount (tokens)</th>
            <th className="w-1/12" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i}>
              <td>
                <AddressInput
                  value={entry.address}
                  onChange={val => updateEntry(i, "address", val)}
                  placeholder="0x..."
                />
              </td>
              <td>
                <input
                  type="number"
                  className="input input-bordered input-sm w-full"
                  value={entry.amount}
                  onChange={e => updateEntry(i, "amount", e.target.value)}
                  placeholder="100"
                  min="0"
                  step="any"
                />
              </td>
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
  );
}

function EditBeneficiariesForm({
  programAddress,
  distributionIndex,
}: {
  programAddress: Address;
  distributionIndex: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [entries, setEntries] = useState<BeneficiaryEntry[]>([{ address: "", amount: "" }]);
  const write = useCGProgramWrite(programAddress);

  const handleSet = async () => {
    const validated = validateBeneficiaries(entries);
    if (!validated) return;

    const success = await write("setBeneficiaries", [
      BigInt(distributionIndex),
      validated.addresses,
      validated.amounts,
    ]);
    if (success) {
      setShowForm(false);
      setEntries([{ address: "", amount: "" }]);
    }
  };

  if (!showForm) {
    return (
      <button className="btn btn-sm btn-outline" onClick={() => setShowForm(true)}>
        Set Beneficiaries
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full border border-base-300 rounded-lg p-3">
      <BeneficiariesTableEditor entries={entries} onChange={setEntries} />
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={handleSet}>
          Confirm
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>
          Cancel
        </button>
      </div>
    </div>
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
}: {
  address: Address;
  crowdfundingInfo: CrowdfundingInfo | undefined;
  distributions: DistributionInfo[];
}) {
  const write = useCGProgramWrite(address);

  const executeDisabledReason = getExecuteDisabledReason(crowdfundingInfo, distributions);
  const canExecute = executeDisabledReason === null;

  return (
    <div>
      <div className="divider" />
      <h3 className="card-title">Owner Actions</h3>
      <div className="flex gap-3 mt-2">
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
          data-tip="Permanently cancel the program. If the crowdfunding has not yet been funded, contributors will be able to claim refunds."
        >
          <button className="btn btn-error" onClick={() => write("cancel")}>
            Cancel Program
          </button>
        </div>
      </div>
    </div>
  );
}
