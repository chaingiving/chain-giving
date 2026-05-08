import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getIronSession } from "iron-session";
import { SignJWT, importJWK } from "jose";
import { isAddress } from "viem";
import { assertSameOrigin } from "~~/utils/origin";
import { rateLimit } from "~~/utils/rateLimit";
import { type SiweSessionData, getSessionOptions } from "~~/utils/siwe";

export const runtime = "nodejs";

const SUPPORTED_ASSETS = ["USDC", "EURC"] as const;
type Asset = (typeof SUPPORTED_ASSETS)[number];

const CDP_HOST = "api.developer.coinbase.com";
const CDP_TOKEN_PATH = "/onramp/v1/token";

async function mintCdpJwt(): Promise<string> {
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
  const uri = `POST ${CDP_HOST}${CDP_TOKEN_PATH}`;

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
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const session = await getIronSession<SiweSessionData>(await cookies(), getSessionOptions());
  if (!session.isLoggedIn || !session.address) {
    return NextResponse.json({ error: "Sign in with your wallet first" }, { status: 401 });
  }

  let body: { asset?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { asset, address } = body;

  if (typeof asset !== "string" || !(SUPPORTED_ASSETS as readonly string[]).includes(asset)) {
    return NextResponse.json({ error: "asset must be USDC or EURC" }, { status: 400 });
  }
  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "address must be a valid 0x address" }, { status: 400 });
  }

  const limit = rateLimit(`onramp:${session.address}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many onramp requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() } },
    );
  }

  let jwt: string;
  try {
    jwt = await mintCdpJwt();
  } catch (err) {
    if ((err as Error).message === "missing-credentials") {
      return NextResponse.json({ error: "Onramp not configured" }, { status: 500 });
    }
    console.error("[onramp] JWT signing failed:", err);
    return NextResponse.json({ error: "Failed to sign request" }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://${CDP_HOST}${CDP_TOKEN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        addresses: [{ address, blockchains: ["base"] }],
        assets: [asset as Asset],
      }),
    });
  } catch (err) {
    console.error("[onramp] upstream fetch failed:", err);
    return NextResponse.json({ error: "Upstream unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[onramp] upstream ${upstream.status}:`, detail);
    return NextResponse.json({ error: "Failed to mint session token" }, { status: 502 });
  }

  const data = (await upstream.json()) as { token?: string; channel_id?: string };
  if (!data.token) {
    console.error("[onramp] upstream response missing token field:", data);
    return NextResponse.json({ error: "Invalid upstream response" }, { status: 502 });
  }

  return NextResponse.json({ token: data.token });
}
