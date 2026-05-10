import { NextRequest, NextResponse } from "next/server";
import { Address, Hex, createPublicClient, decodeFunctionData, fallback, http, isAddress } from "viem";
import * as chains from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import { getServerAlchemyHttpUrl } from "~~/utils/scaffold-eth";

// Server-side fallback RPCs per chain. Mirror of PUBLIC_FALLBACK_RPCS in
// wagmiConfig — when our Alchemy key is rate-limited/down (it returns an
// HTML error page that viem fails to JSON.parse), the publicnode mirror
// keeps the paymaster resolution working.
const SERVER_FALLBACK_RPCS: Record<number, readonly string[]> = {
  [chains.mainnet.id]: ["https://ethereum-rpc.publicnode.com"],
  [chains.sepolia.id]: ["https://ethereum-sepolia-rpc.publicnode.com"],
  [chains.base.id]: ["https://base-rpc.publicnode.com"],
  [chains.baseSepolia.id]: ["https://base-sepolia-rpc.publicnode.com"],
  [chains.optimism.id]: ["https://optimism-rpc.publicnode.com"],
  [chains.optimismSepolia.id]: ["https://optimism-sepolia-rpc.publicnode.com"],
};

/**
 * ERC-7677 Paymaster Service for CGPaymaster.
 *
 * Two callers, two shapes:
 *   1. EIP-5792 wallets (Coinbase Smart Wallet, MetaMask Smart, …) call this
 *      directly from the browser via wagmi's useSendCalls. They pass
 *      `context.orgAddress`, so we use it.
 *   2. The Openfort bundler calls this server-side when a UserOp uses the
 *      Openfort policy that points at this URL. Openfort doesn't pass arbitrary
 *      context — it sends an empty `{}` (the paymaster entity's static context).
 *      In that case we extract the sponsoring org from the userOp's callData:
 *      Openfort smart accounts wrap calls in `execute(target, value, data)` or
 *      `executeBatch`. The target is either the org itself, or a program/token
 *      whose `owner()` returns the org. Either way we resolve back to an org
 *      and verify it via CGRegistry.isOrganization before issuing paymaster
 *      data — without that check, anyone could submit a UserOp targeting an
 *      arbitrary contract and drain the paymaster.
 *
 * The CGPaymaster's `paymasterAndData` layout is:
 *   [0:20]  paymaster contract address
 *   [20:40] sponsoring organization address
 *
 * The chain ID is extracted from `params[2]` to resolve the correct CGPaymaster
 * deployment.
 */

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params: unknown[];
};

type UserOp = {
  sender?: string;
  callData?: string;
};

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBatch",
    inputs: [
      { name: "_target", type: "address[]" },
      { name: "_value", type: "uint256[]" },
      { name: "_calldata", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "isOrganization",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

const PROGRAM_ABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

function getDeployedAddresses(chainId: number) {
  const contracts = (deployedContracts as Record<number, any>)[chainId];
  return {
    paymaster: contracts?.CGPaymaster?.address as Address | undefined,
    registry: contracts?.CGRegistry?.address as Address | undefined,
  };
}

function findChain(chainId: number) {
  return Object.values(chains).find(c => "id" in c && c.id === chainId) as chains.Chain | undefined;
}

function buildPaymasterAndData(paymasterAddr: Address, orgAddr: Address): Hex {
  // [20-byte paymaster][20-byte org]
  return `${paymasterAddr}${orgAddr.slice(2)}` as Hex;
}

function jsonRpcError(id: number | string | null, code: number, message: string) {
  console.error("[paymaster]", code, message);
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * Pull the first concrete call target out of a smart-account userOp.callData.
 * Returns undefined if the calldata is not a recognized execute() / executeBatch().
 */
function extractCallTarget(callData: string | undefined): Address | undefined {
  if (!callData || !callData.startsWith("0x") || callData.length < 10) return undefined;
  try {
    const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: callData as Hex });
    if (decoded.functionName === "execute") {
      return decoded.args[0] as Address;
    }
    if (decoded.functionName === "executeBatch") {
      const targets = decoded.args[0] as readonly Address[];
      // Same-org constraint will be enforced by the on-chain validator + the
      // single orgAddress we return; we use the first call's target as the
      // canonical org-source for routing.
      return targets[0];
    }
  } catch {
    // Not an Openfort-style execute — caller should fall through.
  }
  return undefined;
}

async function resolveOrgAddress(
  chainId: number,
  context: { orgAddress?: string } | undefined,
  userOp: UserOp | undefined,
): Promise<{ orgAddress?: Address; error?: string }> {
  // Path 1: EIP-5792 path supplies orgAddress explicitly.
  if (context?.orgAddress && isAddress(context.orgAddress)) {
    return { orgAddress: context.orgAddress as Address };
  }

  // Path 2: Openfort path — derive from userOp.callData.
  const target = extractCallTarget(userOp?.callData);
  if (!target) {
    return { error: "Cannot determine sponsoring organization: provide context.orgAddress or a recognized callData" };
  }

  const { registry } = getDeployedAddresses(chainId);
  if (!registry) {
    return { error: `CGRegistry not deployed on chain ${chainId}` };
  }
  const chain = findChain(chainId);
  if (!chain) {
    return { error: `Unsupported chain ${chainId}` };
  }
  const transports = [];
  const alchemy = getServerAlchemyHttpUrl(chainId);
  if (alchemy) transports.push(http(alchemy));
  for (const url of SERVER_FALLBACK_RPCS[chainId] ?? []) transports.push(http(url));
  transports.push(http()); // chain-default, last resort
  const client = createPublicClient({ chain, transport: fallback(transports) });

  try {
    const isOrg = await client.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "isOrganization",
      args: [target],
    });
    if (isOrg) return { orgAddress: target };

    // Not an org — assume it's a program/token that exposes owner().
    const ownerAddr = (await client.readContract({
      address: target,
      abi: PROGRAM_ABI,
      functionName: "owner",
    })) as Address;
    const ownerIsOrg = await client.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "isOrganization",
      args: [ownerAddr],
    });
    if (ownerIsOrg) return { orgAddress: ownerAddr };
    return { error: `Target ${target} is not part of any registered organization` };
  } catch (e) {
    return { error: `Failed to resolve org from callData: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const { jsonrpc, id, method, params } = body as JsonRpcRequest;

  if (jsonrpc !== "2.0" || id == null || typeof method !== "string" || !Array.isArray(params)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: (body as any)?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request" } },
      { status: 400 },
    );
  }

  // ERC-7677 params: [userOp, entryPoint, chainId, context]
  const userOp = params[0] as UserOp | undefined;
  const rawChainId = params[2];
  const chainId =
    typeof rawChainId === "string" ? parseInt(rawChainId, 16) : typeof rawChainId === "number" ? rawChainId : undefined;

  if (!chainId) {
    return jsonRpcError(id, -32602, "Missing or invalid chainId in params[2]");
  }

  const { paymaster: paymasterAddress } = getDeployedAddresses(chainId);
  if (!paymasterAddress) {
    return jsonRpcError(id, -32602, `CGPaymaster not deployed on chain ${chainId}`);
  }

  const context = (params[3] as { orgAddress?: string } | undefined) ?? {};
  const { orgAddress, error } = await resolveOrgAddress(chainId, context, userOp);
  if (error || !orgAddress) {
    return jsonRpcError(id, -32602, error ?? "Could not resolve orgAddress");
  }

  const paymasterAndData = buildPaymasterAndData(paymasterAddress, orgAddress);

  switch (method) {
    case "pm_getPaymasterStubData":
    case "pm_getPaymasterData": {
      // CGPaymaster has no off-chain signature, so stub and final are identical.
      return NextResponse.json({ jsonrpc: "2.0", id, result: { paymasterAndData } });
    }
    default:
      return jsonRpcError(id, -32601, `Unknown method: ${method}`);
  }
}
