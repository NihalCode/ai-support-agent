import "server-only";

import { NextResponse } from "next/server";

import { validateMutationCsrf } from "@/lib/enterprise/csrf";
import type { EnterpriseAccess } from "@/lib/enterprise/guard";
import { checkEnterpriseMutationRateLimit } from "@/lib/enterprise/rate-limit";

export const CONTROL_PLANE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
};

export class ApiInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415 = 400
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

export function controlPlaneJson(
  body: unknown,
  init: ResponseInit = {}
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CONTROL_PLANE_HEADERS, ...init.headers },
  });
}

export function requireMutationCsrf(request: Request): NextResponse | null {
  return validateMutationCsrf(request)
    ? null
    : controlPlaneJson(
        { error: "Forbidden", code: "csrf_validation_failed" },
        { status: 403 }
      );
}

export function requireEnterpriseMutationRateLimit(
  access: EnterpriseAccess
): NextResponse | null {
  return checkEnterpriseMutationRateLimit(
    access.context.organization.id,
    access.session.user.id
  )
    ? null
    : controlPlaneJson({ error: "Too many requests" }, { status: 429 });
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ApiInputError("Request body is too large", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readStrictJson(
  request: Request,
  maxBytes = 32 * 1024
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") {
    throw new ApiInputError("Content-Type must be application/json", 415);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      throw new ApiInputError("Invalid Content-Length");
    }
    if (declared > maxBytes) {
      throw new ApiInputError("Request body is too large", 413);
    }
  }
  const text = await readBoundedBody(request, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiInputError("Request body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiInputError("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new ApiInputError("Request contains unsupported fields");
  }
}
