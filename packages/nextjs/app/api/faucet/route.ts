import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIronSession } from "iron-session";
import { SignJWT, importJWK } from "jose";
import { getAddress, isAddress } from "viem";
import { rateLimit } from "~~/utils/rateLimit";
import { type SiweSessionData, getSessionOptions } from "~~/utils/siwe";

export const runtime = "nodejs";

// Coinbase CDP v2 EVM Faucet — see https://docs.cdp.coinbase.com/faucets
// Auth shares the same Ed25519 JWT scheme as the Onramp Token endpoint.
const CDP_HOST = "api.cdp.coinbase.com";
const CDP_FAUCET_PATH = "/platform/v2/evm/faucet";

const SUPPORTED_TOKENS = ["eth", "usdc", "eurc"] as const;
type Token = (typeof SUPPORTED_TOKENS)[number];

// Faucet is only available on testnets. Map chainId → CDP network slug.
const FAUCET_NETWORKS: Record<number, string> = {
  84532: "base-sepolia",
};

async function mintCdpJwt(method: "POST", host: string, path: string): Promise<string> {
  const keyId = process.env.CDP_API_KEY_ID;
  const keySecret = process.env.CDP_API_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("missing-credentials");
  }

  // CDP Ed25519 secret: base64-encoded 64 bytes (32-byte seed + 32-byte public key).
  const raw = Buffer.from(keySecret, "base64");
  if (raw.length !== 64) {
    throw new Error(`invalid-ed25519-key (decoded length ${raw.length}, expected 64)`);
  }
  const privateKey = await importJWK(
    {
      kty: "OKP",
      crv: "Ed25519",
      d: raw.subarray(0, 32).toString("base64url"),
      x: raw.subarray(32).toString("base64url"),
    },
    "EdDSA",
  );

  const nonce = randomBytes(16).toString("hex");
  const uri = `${method} ${host}${path}`;

  return new SignJWT({ uris: [uri] })
    .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT", nonce })
    .setIssuer("cdp")
    .setSubject(keyId)
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000))
    .setExpirationTime("2m")
    .sign(privateKey);
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SiweSessionData>(await cookies(), getSessionOptions());
  if (!session.isLoggedIn || !session.address) {
    return NextResponse.json({ error: "Sign in with your wallet first" }, { status: 401 });
  }

  let body: { address?: unknown; token?: unknown; chainId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, token, chainId } = body;

  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "address must be a valid 0x address" }, { status: 400 });
  }
  if (getAddress(address) !== session.address) {
    return NextResponse.json({ error: "Address does not match the signed-in wallet" }, { status: 403 });
  }
  if (typeof token !== "string" || !(SUPPORTED_TOKENS as readonly string[]).includes(token.toLowerCase())) {
    return NextResponse.json({ error: `token must be one of: ${SUPPORTED_TOKENS.join(", ")}` }, { status: 400 });
  }
  if (typeof chainId !== "number" || !FAUCET_NETWORKS[chainId]) {
    return NextResponse.json({ error: "chainId is not a supported testnet" }, { status: 400 });
  }

  const network = FAUCET_NETWORKS[chainId];
  const normalizedToken = token.toLowerCase() as Token;

  const limit = rateLimit(`faucet:${session.address}:${normalizedToken}`, 1, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Faucet limit reached for ${normalizedToken.toUpperCase()}. Try again in an hour.` },
      { status: 429, headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() } },
    );
  }

  let jwt: string;
  try {
    jwt = await mintCdpJwt("POST", CDP_HOST, CDP_FAUCET_PATH);
  } catch (err) {
    if ((err as Error).message === "missing-credentials") {
      return NextResponse.json({ error: "Faucet not configured" }, { status: 500 });
    }
    console.error("[faucet] JWT signing failed:", err);
    return NextResponse.json({ error: "Failed to sign request" }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://${CDP_HOST}${CDP_FAUCET_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ address, network, token: normalizedToken }),
    });
  } catch (err) {
    console.error("[faucet] upstream fetch failed:", err);
    return NextResponse.json({ error: "Upstream unreachable" }, { status: 502 });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(`[faucet] upstream ${upstream.status}:`, text);
    return NextResponse.json({ error: text || "Faucet request failed" }, { status: upstream.status });
  }

  let data: { transactionHash?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Some CDP error responses are plain text — treat malformed JSON as an upstream issue.
    console.error("[faucet] upstream returned non-JSON:", text);
    return NextResponse.json({ error: "Invalid upstream response" }, { status: 502 });
  }

  return NextResponse.json({ transactionHash: data.transactionHash ?? null });
}
