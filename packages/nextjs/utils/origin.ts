import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Reject any browser request whose Origin/Referer does not match the request's
// Host header. Vercel preview deployments and production share the same model:
// the browser's page origin equals the host it just POSTed to, so same-host
// matching covers all environments without an explicit allowlist. CORS handles
// the *read* side; this guard handles simple POSTs that bypass preflight.
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host");
  if (!host) {
    return NextResponse.json({ error: "Missing Host header" }, { status: 400 });
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = origin ?? referer;
  if (!candidate) {
    return NextResponse.json({ error: "Missing Origin/Referer" }, { status: 403 });
  }

  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    return NextResponse.json({ error: "Malformed Origin/Referer" }, { status: 403 });
  }

  if (candidateHost !== host) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  return null;
}
