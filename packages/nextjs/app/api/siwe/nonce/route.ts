import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { generateSiweNonce } from "viem/siwe";
import { type SiweSessionData, getSessionOptions } from "~~/utils/siwe";

export const runtime = "nodejs";

export async function GET() {
  const session = await getIronSession<SiweSessionData>(await cookies(), getSessionOptions());
  const nonce = generateSiweNonce();
  session.nonce = nonce;
  await session.save();
  return NextResponse.json({ nonce });
}
