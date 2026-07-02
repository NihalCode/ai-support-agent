import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth0 } from "@/lib/auth0";

/**
 * Auth0 OAuth routes run in Node route handlers (not Edge middleware) so
 * transaction cookies survive the redirect chain to Auth0 and back.
 */
async function handleAuth(request: NextRequest): Promise<NextResponse> {
  if (!auth0) {
    return NextResponse.json({ error: "Auth0 is not configured." }, { status: 503 });
  }
  return auth0.middleware(request);
}

export async function GET(request: NextRequest) {
  return handleAuth(request);
}

export async function POST(request: NextRequest) {
  return handleAuth(request);
}

export async function DELETE(request: NextRequest) {
  return handleAuth(request);
}
