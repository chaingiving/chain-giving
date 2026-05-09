import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { type SiweSessionData, defaultSession, getSessionOptions } from "~~/utils/siwe";

export const runtime = "nodejs";

export async function GET() {
  const session = await getIronSession<SiweSessionData>(await cookies(), getSessionOptions());
  if (!session.isLoggedIn) {
    return NextResponse.json(defaultSession);
  }
  return NextResponse.json({
    isLoggedIn: true,
    address: session.address,
    chainId: session.chainId,
    signedInAt: session.signedInAt,
  });
}

export async function DELETE() {
  const session = await getIronSession<SiweSessionData>(await cookies(), getSessionOptions());
  session.destroy();
  return NextResponse.json({ ok: true });
}
