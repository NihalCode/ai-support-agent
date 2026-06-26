import { describe, expect, it } from "vitest";
import {
  createSingleEditorLayout,
  splitEditorRight,
  closeEditorGroup,
  openTabInGroup,
  joinAllEditorGroups,
  compareWithActive,
} from "../editor-layout-state";

describe("editor-layout-state", () => {
  it("starts single group with welcome tab", () => {
    const layout = createSingleEditorLayout();
    expect(layout.groups).toHaveLength(1);
    expect(layout.orientation).toBe("single");
  });

  it("splits editor right", () => {
    const layout = splitEditorRight(createSingleEditorLayout());
    expect(layout.groups.length).toBe(2);
    expect(layout.orientation).toBe("horizontal");
  });

  it("opens tab to side in second group", () => {
    let layout = splitEditorRight(createSingleEditorLayout());
    const secondId = layout.groups[1].id;
    layout = openTabInGroup(
      layout,
      { id: "api-registry", kind: "api-registry", title: "API Registry" },
      secondId
    );
    expect(layout.groups[1].tabs.some((t) => t.id === "api-registry")).toBe(true);
  });

  it("closes group and merges tabs", () => {
    let layout = splitEditorRight(createSingleEditorLayout());
    const second = layout.groups[1].id;
    layout = openTabInGroup(layout, { id: "cql", kind: "cql", title: "CQL" }, second);
    layout = closeEditorGroup(layout, second);
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].tabs.some((t) => t.id === "cql")).toBe(true);
  });

  it("compare with active opens split", () => {
    const layout = compareWithActive(createSingleEditorLayout(), {
      id: "diff-1",
      kind: "diff",
      title: "Diff",
    });
    expect(layout.groups.length).toBe(2);
  });

  it("join all groups", () => {
    let layout = splitEditorRight(createSingleEditorLayout());
    layout = joinAllEditorGroups(layout);
    expect(layout.groups).toHaveLength(1);
    expect(layout.orientation).toBe("single");
  });
});
