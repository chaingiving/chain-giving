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
 * The org address is passed via the `context.orgAddress` field from the frontend.
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

  const context = (params?.[3] as { orgAddress?: string } | undefined) ?? {};
  const orgAddress = context.orgAddress;

  if (!orgAddress || !isAddress(orgAddress)) {
    return jsonRpcError(id, -32602, "Missing or invalid context.orgAddress");
  }

  const paymasterAndData = buildPaymasterAndData(paymasterAddress, orgAddress as Address);

  switch (method) {
    case "pm_getPaymasterStubData": {
      // Return stub data for gas estimation. The wallet uses this to estimate
      // gas before requesting the final paymaster data.
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            paymasterAndData,
          },
        },
        { headers: CORS_HEADERS },
      );
    }

    case "pm_getPaymasterData": {
      // Return final paymaster data for the actual UserOperation.
      // For CGPaymaster, stub and final data are identical since there is
      // no off-chain signature required.
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          result: {
            paymasterAndData,
          },
        },
        { headers: CORS_HEADERS },
      );
    }

    default:
      return jsonRpcError(id, -32601, `Unknown method: ${method}`);
  }
}
