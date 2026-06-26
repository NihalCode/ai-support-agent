import { describe, expect, it } from "vitest";
import { validateCommand, listTerminalCommands } from "@/lib/support/terminal/runner";

describe("terminal runner", () => {
  it("lists allowlisted commands", () => {
    expect(listTerminalCommands().length).toBeGreaterThan(3);
  });

  it("allows npm test", () => {
    expect(validateCommand("npm test").ok).toBe(true);
  });

  it("blocks destructive commands", () => {
    expect(validateCommand("rm -rf /").ok).toBe(false);
  });

  it("blocks .env reads", () => {
    expect(validateCommand("cat .env").ok).toBe(false);
  });
});
