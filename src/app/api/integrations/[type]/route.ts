import { type NextRequest, NextResponse } from "next/server";

import {
  assertConfigureIntegration,
  assertDisconnectIntegration,
  requireIntegrationRead,
} from "@/integrations/core/integration-api-auth";
import { canConfigureIntegrations } from "@/lib/auth/roles";
import {
  configureIntegration,
  disconnectIntegration,
  getIntegrationStatus,
  isEnterpriseIntegrationId,
  testIntegration,
} from "@/integrations/core/integration-route-handlers";

export const runtime = "nodejs";

type Params = { params: Promise<{ type: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const sessionOrResponse = await requireIntegrationRead(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { type } = await params;
  if (!isEnterpriseIntegrationId(type)) {
    return NextResponse.json({ error: "Unknown integration type" }, { status: 404 });
  }

  const status = await getIntegrationStatus(sessionOrResponse.user.orgId, type);
  return NextResponse.json(status);
}

export async function POST(request: NextRequest, { params }: Params) {
  const sessionOrResponse = await requireIntegrationRead(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { type } = await params;
  if (!isEnterpriseIntegrationId(type)) {
    return NextResponse.json({ error: "Unknown integration type" }, { status: 404 });
  }

  let body: {
    action?: "configure" | "disconnect" | "test";
    credentials?: Record<string, string>;
    metadata?: Record<string, string | string[]>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "test") {
    const result = await testIntegration(sessionOrResponse, type);
    return NextResponse.json({ health: result });
  }

  if (body.action === "configure" || body.action === "disconnect") {
    const forbidden =
      body.action === "configure"
        ? assertConfigureIntegration(sessionOrResponse, type)
        : assertDisconnectIntegration(sessionOrResponse, type);
    if (forbidden) return forbidden;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (
    type !== "jira" &&
    (body.action === "configure" || body.action === "disconnect") &&
    !canConfigureIntegrations(sessionOrResponse.user.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (body.action === "configure") {
      if (!body.credentials) {
        return NextResponse.json({ error: "credentials required" }, { status: 400 });
      }
      const result = await configureIntegration(sessionOrResponse, type, {
        credentials: body.credentials,
        metadata: body.metadata,
      });
      return NextResponse.json(result);
    }

    if (body.action === "disconnect") {
      const result = await disconnectIntegration(sessionOrResponse, type);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
