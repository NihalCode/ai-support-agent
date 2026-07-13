import { describe, expect, it } from "vitest";

import {
  canCapability,
  type ControlPlaneContext,
} from "@/lib/admin/control-plane-client";

const context: ControlPlaneContext = {
  organization: { id: "org-1" },
  actor: { id: "user-1" },
  role: "developer",
  capabilities: ["resources.read", "changes.create"],
  assurance: { mfaVerified: false, authTimeAvailable: true },
  csrfToken: "token",
};

describe("control-plane client helpers", () => {
  it("checks capabilities from context", () => {
    expect(canCapability(context, "resources.read")).toBe(true);
    expect(canCapability(context, "credentials.manage")).toBe(false);
    expect(canCapability(null, "resources.read")).toBe(false);
  });
});
