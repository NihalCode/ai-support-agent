import { createHash, randomBytes } from "node:crypto";

/** Generate a URL-safe invite token and its SHA-256 hash for storage. */
export function generateInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}
