import { NextResponse } from "next/server";

/**
 * Mints a Shield encryption session ID so Openfort's SDK can transparently
 * fetch the user's recovery share without prompting them for a passkey or
 * password. Called by @openfort/react when walletRecovery.allowedMethods
 * includes RecoveryMethod.AUTOMATIC.
 *
 * The session is single-use and short-lived. Holding one does NOT grant
 * access to anyone's wallet — the user still needs a valid Openfort access
 * token for Shield to release the share. So the route itself doesn't gate
 * on auth, mirroring the official Openfort samples; same-origin protection
 * comes from the browser refusing cross-origin POSTs without CORS.
 *
 * Required env vars (server-only, never expose to client):
 *   OPENFORT_SHIELD_SECRET_KEY     - secret API key from dashboard
 *   OPENFORT_SHIELD_ENCRYPTION_SHARE - project-side half of the encryption key
 *
 * The Shield publishable key is also needed and is the same one already on
 * the client as NEXT_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY — read it from
 * the public env (no separate server var needed).
 */

export const runtime = "nodejs";

const SHIELD_URL = "https://shield.openfort.io/project/encryption-session";

export async function POST() {
  const apiKey = process.env.NEXT_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY;
  const apiSecret = process.env.OPENFORT_SHIELD_SECRET_KEY;
  const encryptionPart = process.env.OPENFORT_SHIELD_ENCRYPTION_SHARE;

  if (!apiKey || !apiSecret || !encryptionPart) {
    console.error("[openfort/encryption-session] missing Shield env vars");
    return NextResponse.json({ error: "Shield credentials not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(SHIELD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
      },
      body: JSON.stringify({ encryption_part: encryptionPart }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[openfort/encryption-session] Shield error", res.status, body);
      return NextResponse.json({ error: "Failed to create encryption session" }, { status: 502 });
    }

    const json = (await res.json()) as { session_id?: string };
    if (!json.session_id) {
      console.error("[openfort/encryption-session] Shield response missing session_id", json);
      return NextResponse.json({ error: "Invalid encryption session response" }, { status: 502 });
    }

    return NextResponse.json({ session: json.session_id });
  } catch (err) {
    console.error("[openfort/encryption-session]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
