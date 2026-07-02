import { describe, expect, it } from "vitest";

import { generateInviteToken, hashInviteToken } from "@/lib/auth/invite-tokens";

describe("invite-tokens", () => {
  it("hashes token deterministically", () => {
    const hash1 = hashInviteToken("abc123");
    const hash2 = hashInviteToken("abc123");
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe("abc123");
  });

  it("generates unique raw tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).toBe(hashInviteToken(a.rawToken));
  });
});
