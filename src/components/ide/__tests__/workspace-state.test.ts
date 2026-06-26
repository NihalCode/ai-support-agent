import { describe, expect, it } from "vitest";
import {
  activityToDefaultTab,
  closeTab,
  createWelcomeTab,
  initialWorkspaceState,
  openTab,
  parseSlashCommand,
} from "../workspace-state";

describe("IDE workspace-state", () => {
  it("creates welcome tab on init", () => {
    const s = initialWorkspaceState();
    expect(s.editorLayout.groups[0].tabs).toHaveLength(1);
    expect(s.editorLayout.groups[0].tabs[0].kind).toBe("welcome");
  });

  it("opens and deduplicates tabs", () => {
    const tab = { id: "inv", kind: "investigation" as const, title: "Investigation" };
    const first = openTab([], tab);
    expect(first.tabs).toHaveLength(1);
    const second = openTab(first.tabs, tab);
    expect(second.tabs).toHaveLength(1);
    expect(second.activeTabId).toBe("inv");
  });

  it("closes tab and selects neighbor", () => {
    const a = { id: "a", kind: "welcome" as const, title: "A" };
    const b = { id: "b", kind: "diagnose" as const, title: "B" };
    const closed = closeTab([a, b], "b", "b");
    expect(closed.tabs).toHaveLength(1);
    expect(closed.activeTabId).toBe("a");
  });

  it("maps activity to default tabs", () => {
    expect(activityToDefaultTab("cql")?.kind).toBe("cql");
    expect(activityToDefaultTab("chat")).toBeNull();
  });

  it("parses slash commands", () => {
    expect(parseSlashCommand("/investigate foo")?.command).toBe("/investigate");
    expect(parseSlashCommand("/investigate foo")?.rest).toBe("foo");
    expect(parseSlashCommand("hello")).toBeNull();
  });

  it("welcome tab is stable", () => {
    expect(createWelcomeTab().id).toBe("welcome");
  });
});
