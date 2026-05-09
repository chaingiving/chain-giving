import { NextRequest, NextResponse } from "next/server";
import { Address, Hex, isAddress } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";

/**
 * ERC-7677 Paymaster Service for CGPaymaster.
 *
 * Wallets that support EIP-5792 `paymasterService` capability will call this
 * endpoint with JSON-RPC methods `pm_getPaymasterStubData` and
 * `pm_getPaymasterData`.
 *
 * The CGPaymaster's `paymasterAndData` layout is:
 *   [0:20]  paymaster contract address
 *   [20:40] sponsoring organization address
 *
 * The org address is read from the `?org=0x...` query string (preferred — survives
 * wallets that drop the EIP-5792 `capabilities.paymasterService.context` field,
 * such as Reown's embedded smart wallets) and falls back to `context.orgAddress`
 * for wallets that do propagate context.
 *
 * The chain ID is extracted from `params[2]` to resolve the correct CGPaymaster deployment.
 */

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params: unknown[];
};

// ERC-7677 paymaster endpoints are called cross-origin by wallet UIs (e.g.
// Reown / WalletConnect's secure.walletconnect.org iframe), so the route must
// advertise CORS to clear preflight.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function getPaymasterAddress(chainId: number): Address | undefined {
  const contracts = (deployedContracts as Record<number, any>)[chainId];
  return contracts?.CGPaymaster?.address as Address | undefined;
}

function buildPaymasterAndData(paymasterAddr: Address, orgAddr: Address): Hex {
  // paymasterAndData = [20-byte paymaster address][20-byte org address]
  // Both are 0x-prefixed hex, so strip the 0x from orgAddr and concatenate
  return `${paymasterAddr}${orgAddr.slice(2)}` as Hex;
}

// EntryPoint v0.7 canonical address (case-insensitive compare).
const ENTRYPOINT_V07 = "0x0000000071727de22e5e9d8baf0edac6f37da032";
function isEntryPointV07(addr: unknown): boolean {
  return typeof addr === "string" && addr.toLowerCase() === ENTRYPOINT_V07;
}

function jsonRpcError(id: number | string | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { jsonrpc, id, method, params } = body as JsonRpcRequest;

  const queryString = req.nextUrl.search;
  const entryPointAddr = params?.[1];
  const rawChainIdParam = params?.[2];
  const ctx = params?.[3];
  console.log("[paymaster] request", {
    method,
    id,
    query: queryString,
    entryPoint: entryPointAddr,
    chainId: rawChainIdParam,
    context: ctx,
    origin: req.headers.get("origin"),
  });

  if (jsonrpc !== "2.0" || id == null || typeof method !== "string" || !Array.isArray(params)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: (body as any)?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request" } },
      { status: 400 },
    );
  }

  // Both methods receive the same params shape:
  // [userOp, entryPoint, chainId, context]
  const rawChainId = params?.[2];
  const chainId =
    typeof rawChainId === "string" ? parseInt(rawChainId, 16) : typeof rawChainId === "number" ? rawChainId : undefined;

  if (!chainId) {
    return jsonRpcError(id, -32602, "Missing or invalid chainId in params[2]");
  }

  const paymasterAddress = getPaymasterAddress(chainId);
  if (!paymasterAddress) {
    return jsonRpcError(id, -32602, `CGPaymaster not deployed on chain ${chainId}`);
  }

  // Prefer ?org=0x... over context.orgAddress: some wallets (e.g. Reown's
  // embedded smart wallet) drop EIP-5792 paymasterService.context entirely.
  const queryOrg = req.nextUrl.searchParams.get("org");
  const context = (params?.[3] as { orgAddress?: string } | undefined) ?? {};
  const orgAddress = queryOrg ?? context.orgAddress;

  if (!orgAddress || !isAddress(orgAddress)) {
    return jsonRpcError(id, -32602, "Missing or invalid org address (?org=0x... or context.orgAddress)");
  }

  const paymasterAndData = buildPaymasterAndData(paymasterAddress, orgAddress as Address);
  const v07 = isEntryPointV07(entryPointAddr);

  // CGPaymaster needs no off-chain signature, so stub and final data are
  // identical. Setting `isFinal: true` on the stub response tells the wallet
  // it can submit using the stub directly and skip pm_getPaymasterData —
  // some smart-wallet stacks (Reown / Magic) never call the second method
  // and would otherwise drop the paymaster from the final UserOp.
  const orgDataHex = `0x${orgAddress.slice(2)}` as Hex;
  // For paymaster-side gas, hold a generous margin: validate is a single
  // SLOAD + SSTORE on CGPaymaster, postOp is a SSTORE refund, both well
  // under 100k. v0.7 separates these into explicit fields.
  const v07Result = {
    paymaster: paymasterAddress,
    paymasterData: orgDataHex,
    paymasterVerificationGasLimit: "0x186a0", // 100_000
    paymasterPostOpGasLimit: "0x186a0", // 100_000
    isFinal: true,
  };
  const v06Result = { paymasterAndData, isFinal: true };
  const result = v07 ? v07Result : v06Result;

  switch (method) {
    case "pm_getPaymasterStubData":
    case "pm_getPaymasterData": {
      console.log("[paymaster] response", { method, id, version: v07 ? "v0.7" : "v0.6", result });
      return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS_HEADERS });
    }

    default:
      console.log("[paymaster] unknown method", { method, id });
      return jsonRpcError(id, -32601, `Unknown method: ${method}`);
  }
}
