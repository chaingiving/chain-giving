"use client";

import { useState } from "react";
import Link from "next/link";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import { Address, erc20Abi, formatUnits, isAddress, isAddressEqual, parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { QrCodeIcon } from "@heroicons/react/24/outline";
import { AccountQRCodeModal } from "~~/components/AccountQRCodeModal";
import { AddressInputWithQr } from "~~/components/AddressInputWithQr";
import { CurrencyLogo } from "~~/components/CurrencyLogo";
import { cgOrganizationAbi } from "~~/contracts/cgOrganizationAbi";
import { cgProgramAbi } from "~~/contracts/cgProgramAbi";
import { cgTokenAbi } from "~~/contracts/cgTokenAbi";
import { DonationCurrency, getDonationCurrencies } from "~~/contracts/donationCurrencies";
import { useBlockExplorerLink, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useCGTokenWrite } from "~~/hooks/useCGTokenWrite";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Single token row with balance + actions ──────────────────────────────────

function WalletTokenRow({
  walletAddress,
  tokenAddress,
  tokenId,
  programName,
  programAddress,
  orgAddress,
  isOwnWallet,
}: {
  walletAddress: Address;
  tokenAddress: Address;
  tokenId: bigint;
  programName: string;
  programAddress: Address;
  orgAddress: Address;
  isOwnWallet: boolean;
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [showBurn, setShowBurn] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const write = useCGTokenWrite(tokenAddress, orgAddress);

  const { data: tokenType } = useReadContract({
    address: tokenAddress,
    abi: cgTokenAbi,
    functionName: "getTokenType",
    args: [tokenId],
    query: { refetchInterval: 5000 },
  });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: cgTokenAbi,
    functionName: "balanceOf",
    args: [walletAddress, tokenId],
    query: { refetchInterval: 5000 },
  });

  const tt = tokenType as TokenTypeInfo | undefined;
  const userBalance = balance as bigint | undefined;

  if (!tt || userBalance === undefined || userBalance === 0n) return null;

  const handleTransfer = async () => {
    if (!isAddress(transferTo)) {
      notification.error("Invalid recipient address");
      return;
    }
    const amt = Number(transferAmount);
    if (!transferAmount || !Number.isInteger(amt) || amt <= 0) {
      notification.error("Amount must be a positive integer");
      return;
    }
    if (BigInt(amt) > userBalance) {
      notification.error("Amount exceeds balance");
      return;
    }
    const ok = await write("safeTransferFrom", [walletAddress, transferTo as Address, tokenId, BigInt(amt), "0x"]);
    if (ok) {
      setTransferTo("");
      setTransferAmount("");
      setShowTransfer(false);
      refetchBalance();
    }
  };

  const handleBurn = async () => {
    const amt = Number(burnAmount);
    if (!burnAmount || !Number.isInteger(amt) || amt <= 0) {
      notification.error("Amount must be a positive integer");
      return;
    }
    if (BigInt(amt) > userBalance) {
      notification.error("Amount exceeds balance");
      return;
    }
    const ok = await write("burn", [walletAddress, tokenId, BigInt(amt)]);
    if (ok) {
      setBurnAmount("");
      setShowBurn(false);
      refetchBalance();
    }
  };

  const supplyLabel =
    tt.maxSupply === 0n ? "Fungible" : tt.maxSupply === 1n ? "NFT (max 1)" : `Max ${tt.maxSupply.toString()}`;

  return (
    <div className="border border-base-300 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-outline badge-sm">#{tokenId.toString()}</span>
        <span className="font-semibold text-base">
          {tt.name} ({tt.symbol})
        </span>
        <span className="badge badge-ghost badge-sm">{supplyLabel}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="opacity-70">
          Program:{" "}
          <Link href={`/program/${programAddress}`} className="link">
            {programName}
          </Link>
        </span>
        <span className="font-medium">
          Balance: <span className="font-bold">{userBalance.toString()}</span>
        </span>
      </div>

      {isOwnWallet && (
        <div className="flex flex-wrap gap-2">
          {tt.transferable && (
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setShowTransfer(v => !v);
                setShowBurn(false);
              }}
            >
              Transfer
            </button>
          )}
          {tt.burnable && (
            <button
              className="btn btn-sm btn-outline btn-error"
              onClick={() => {
                setShowBurn(v => !v);
                setShowTransfer(false);
              }}
            >
              Burn
            </button>
          )}
        </div>
      )}

      {showTransfer && (
        <div className="flex flex-col gap-2 p-3 bg-base-200 rounded-lg">
          <p className="text-sm font-medium">Transfer tokens</p>
          <AddressInputWithQr value={transferTo} onChange={setTransferTo} placeholder="Recipient address" />
          <div className="flex gap-2 items-center">
            <div className="flex flex-1 input input-bordered input-sm items-center pr-1 gap-1">
              <input
                type="number"
                min="1"
                step="1"
                className="flex-1 bg-transparent outline-none min-w-0"
                placeholder="Amount"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-xs text-xs px-1 h-5 min-h-0 opacity-60 hover:opacity-100"
                onClick={() => setTransferAmount(userBalance.toString())}
                title="Use full balance"
              >
                Max
              </button>
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleTransfer}>
              Send
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowTransfer(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showBurn && (
        <div className="flex flex-col gap-2 p-3 bg-base-200 rounded-lg">
          <p className="text-sm font-medium">Burn tokens (irreversible)</p>
          <div className="flex gap-2 items-center">
            <div className="flex flex-1 input input-bordered input-sm items-center pr-1 gap-1">
              <input
                type="number"
                min="1"
                step="1"
                className="flex-1 bg-transparent outline-none min-w-0"
                placeholder="Amount to burn"
                value={burnAmount}
                onChange={e => setBurnAmount(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-xs text-xs px-1 h-5 min-h-0 opacity-60 hover:opacity-100"
                onClick={() => setBurnAmount(userBalance.toString())}
                title="Use full balance"
              >
                Max
              </button>
            </div>
            <button className="btn btn-sm btn-error" onClick={handleBurn}>
              Burn
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowBurn(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tokens within a single program ───────────────────────────────────────────

function ProgramTokens({
  walletAddress,
  programAddress,
  orgAddress,
  isOwnWallet,
}: {
  walletAddress: Address;
  programAddress: Address;
  orgAddress: Address;
  isOwnWallet: boolean;
}) {
  const { data: programName } = useReadContract({
    address: programAddress,
    abi: cgProgramAbi,
    functionName: "name",
    query: { refetchInterval: 30000 },
  });

  const { data: tokenAddress } = useReadContract({
    address: programAddress,
    abi: cgProgramAbi,
    functionName: "token",
    query: { refetchInterval: 30000 },
  });

  const { data: tokenTypes } = useReadContract({
    address: programAddress,
    abi: cgProgramAbi,
    functionName: "getTokenTypes",
    query: { enabled: !!tokenAddress, refetchInterval: 5000 },
  });

  const types = tokenTypes as TokenTypeInfo[] | undefined;

  if (!tokenAddress || !types || types.length === 0) return null;

  return (
    <>
      {types.map(tt => (
        <WalletTokenRow
          key={`${programAddress}-${tt.tokenId}`}
          walletAddress={walletAddress}
          tokenAddress={tokenAddress as Address}
          tokenId={tt.tokenId}
          programName={(programName as string) ?? "Unknown"}
          programAddress={programAddress}
          orgAddress={orgAddress}
          isOwnWallet={isOwnWallet}
        />
      ))}
    </>
  );
}

// ── Programs within a single organization ────────────────────────────────────

function OrgTokens({
  walletAddress,
  orgAddress,
  isOwnWallet,
}: {
  walletAddress: Address;
  orgAddress: Address;
  isOwnWallet: boolean;
}) {
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
        <ProgramTokens
          key={addr}
          walletAddress={walletAddress}
          programAddress={addr}
          orgAddress={orgAddress}
          isOwnWallet={isOwnWallet}
        />
      ))}
    </>
  );
}

// ── Donation currency balance row (renders nothing if zero) ─────────────────

function CurrencyBalanceRow({
  walletAddress,
  currency,
  isOwnWallet,
}: {
  walletAddress: Address;
  currency: DonationCurrency;
  isOwnWallet: boolean;
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { writeContractAsync } = useWriteContract();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: currency.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletAddress],
    query: { refetchInterval: 5000 },
  });

  if (balance === undefined || balance === 0n) return null;

  const handleTransfer = async () => {
    if (!isAddress(transferTo)) {
      notification.error("Invalid recipient address");
      return;
    }
    let amountWei: bigint;
    try {
      amountWei = parseUnits(transferAmount, currency.decimals);
    } catch {
      notification.error("Invalid amount");
      return;
    }
    if (amountWei <= 0n) {
      notification.error("Amount must be positive");
      return;
    }
    if (amountWei > balance) {
      notification.error("Amount exceeds balance");
      return;
    }
    setIsPending(true);
    try {
      await writeContractAsync({
        address: currency.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [transferTo as Address, amountWei],
      });
      setTransferTo("");
      setTransferAmount("");
      setShowTransfer(false);
      refetchBalance();
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="border border-base-300 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <CurrencyLogo currency={currency} size={28} />
        <div className="flex flex-col">
          <span className="font-semibold text-base">{currency.symbol}</span>
          <span className="text-xs opacity-60">{currency.name}</span>
        </div>
        <span className="ml-auto font-mono font-bold text-lg">{formatUnits(balance, currency.decimals)}</span>
        {isOwnWallet && (
          <button className="btn btn-sm btn-outline" onClick={() => setShowTransfer(v => !v)}>
            Transfer
          </button>
        )}
      </div>

      {showTransfer && (
        <div className="flex flex-col gap-2 p-3 bg-base-200 rounded-lg">
          <p className="text-sm font-medium flex items-center gap-1.5">
            Transfer <CurrencyLogo currency={currency} /> {currency.symbol}
          </p>
          <AddressInputWithQr value={transferTo} onChange={setTransferTo} placeholder="Recipient address" />
          <div className="flex gap-2 items-center">
            <div className="flex flex-1 input input-bordered input-sm items-center pr-1 gap-1">
              <input
                type="number"
                min="0"
                step="any"
                className="flex-1 bg-transparent outline-none min-w-0"
                placeholder={`Amount (${currency.symbol})`}
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-xs text-xs px-1 h-5 min-h-0 opacity-60 hover:opacity-100"
                onClick={() => setTransferAmount(formatUnits(balance, currency.decimals))}
                title="Use full balance"
              >
                Max
              </button>
            </div>
            <button className="btn btn-sm btn-primary" disabled={isPending} onClick={handleTransfer}>
              {isPending ? <span className="loading loading-spinner loading-xs" /> : "Send"}
            </button>
            <button className="btn btn-sm btn-ghost" disabled={isPending} onClick={() => setShowTransfer(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Donation currencies section ──────────────────────────────────────────────

function DonationCurrencyBalances({ walletAddress, isOwnWallet }: { walletAddress: Address; isOwnWallet: boolean }) {
  const { chainId } = useAccount();
  const currencies = getDonationCurrencies(chainId);

  if (currencies.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {currencies.map(c => (
        <CurrencyBalanceRow key={c.address} walletAddress={walletAddress} currency={c} isOwnWallet={isOwnWallet} />
      ))}
    </div>
  );
}

// ── Main wallet view ─────────────────────────────────────────────────────────

export const WalletView = ({ address }: { address: Address }) => {
  const { address: connectedAddress } = useAccount();
  const [showQR, setShowQR] = useState(false);

  const isOwnWallet = connectedAddress ? isAddressEqual(connectedAddress, address) : false;
  const addressLink = useBlockExplorerLink(address);

  const { data: orgAddresses, isLoading } = useScaffoldReadContract({
    contractName: "CGRegistry",
    functionName: "getOrganizations",
    args: [0n, BigInt(100)],
    watch: true,
  });

  return (
    <div className="flex flex-col gap-6 px-4 py-8 max-w-5xl mx-auto">
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title text-2xl">Wallet</h2>
            {isOwnWallet && <span className="badge badge-primary">Your Account</span>}
          </div>

          <div className="flex items-center gap-3 mt-2">
            <AddressDisplay address={address} format="long" blockExplorerAddressLink={addressLink} />
            <button className="btn btn-ghost btn-sm" title="Show QR code" onClick={() => setShowQR(true)}>
              <QrCodeIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="divider" />

          <h3 className="card-title">Supported Currencies</h3>
          <DonationCurrencyBalances walletAddress={address} isOwnWallet={isOwnWallet} />

          <div className="divider" />

          <h3 className="card-title">Chain.Giving Tokens</h3>

          {!connectedAddress && (
            <div className="alert alert-info text-sm">
              <span>Connect your wallet to see if this is your account and to perform token actions.</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : !orgAddresses || orgAddresses.length === 0 ? (
            <p className="opacity-60 text-sm">No programs exist yet. No tokens to display.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {orgAddresses.map((orgAddr: string) => (
                <OrgTokens key={orgAddr} walletAddress={address} orgAddress={orgAddr} isOwnWallet={isOwnWallet} />
              ))}
              <p className="opacity-50 text-sm italic mt-2">
                If you don&apos;t see any tokens, this wallet may not hold any yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {showQR && <AccountQRCodeModal address={address} onClose={() => setShowQR(false)} />}
    </div>
  );
};
