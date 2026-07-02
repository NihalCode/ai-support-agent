import type { EditorTab, EditorLayout, EditorGroup } from "./types";

export const DEFAULT_GROUP_ID = "group-primary";

export function createWelcomeTab(): EditorTab {
  return { id: "welcome", kind: "welcome", title: "Home" };
}

export function createSingleEditorLayout(): EditorLayout {
  const welcome = createWelcomeTab();
  return {
    orientation: "single",
    groups: [{ id: DEFAULT_GROUP_ID, tabs: [welcome], activeTabId: welcome.id }],
    activeGroupId: DEFAULT_GROUP_ID,
  };
}

export function getActiveGroup(layout: EditorLayout): EditorGroup {
  return layout.groups.find((g) => g.id === layout.activeGroupId) ?? layout.groups[0];
}

export function openTabInGroup(
  layout: EditorLayout,
  tab: EditorTab,
  groupId?: string,
  opts?: { side?: boolean }
): EditorLayout {
  const targetGroupId = opts?.side
    ? layout.groups.find((g) => g.id !== (groupId ?? layout.activeGroupId))?.id ??
      splitEditorRight(layout, groupId).groups[1]?.id
    : groupId ?? layout.activeGroupId;

  const gid = targetGroupId ?? layout.activeGroupId;
  const groups = layout.groups.map((g) => {
    if (g.id !== gid) return g;
    const exists = g.tabs.find((t) => t.id === tab.id);
    if (exists) return { ...g, activeTabId: tab.id };
    return { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id };
  });
  return { ...layout, groups, activeGroupId: gid };
}

export function closeTabInGroup(
  layout: EditorLayout,
  tabId: string,
  groupId?: string
): EditorLayout {
  const gid = groupId ?? layout.activeGroupId;
  const groups = layout.groups.map((g) => {
    if (g.id !== gid) return g;
    const next = g.tabs.filter((t) => t.id !== tabId);
    let activeTabId = g.activeTabId;
    if (g.activeTabId === tabId) {
      const idx = g.tabs.findIndex((t) => t.id === tabId);
      activeTabId = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? null;
    }
    return { ...g, tabs: next, activeTabId };
  });
  return { ...layout, groups };
}

export function setActiveTabInGroup(
  layout: EditorLayout,
  tabId: string,
  groupId?: string
): EditorLayout {
  const gid = groupId ?? layout.activeGroupId;
  return {
    ...layout,
    activeGroupId: gid,
    groups: layout.groups.map((g) => (g.id === gid ? { ...g, activeTabId: tabId } : g)),
  };
}

export function setActiveGroup(layout: EditorLayout, groupId: string): EditorLayout {
  return { ...layout, activeGroupId: groupId };
}

export function splitEditorRight(layout: EditorLayout, fromGroupId?: string): EditorLayout {
  const fromId = fromGroupId ?? layout.activeGroupId;
  const from = layout.groups.find((g) => g.id === fromId);
  if (!from) return layout;
  if (layout.groups.length >= 2 && layout.orientation === "horizontal") {
    return layout;
  }
  const newGroupId = `group-${crypto.randomUUID().slice(0, 8)}`;
  const welcome = createWelcomeTab();
  return {
    orientation: "horizontal",
    activeGroupId: newGroupId,
    groups: [
      ...layout.groups,
      { id: newGroupId, tabs: [welcome], activeTabId: welcome.id },
    ],
  };
}

export function splitEditorDown(layout: EditorLayout, _fromGroupId?: string): EditorLayout {
  if (layout.groups.length >= 2 && layout.orientation === "vertical") return layout;
  const newGroupId = `group-${crypto.randomUUID().slice(0, 8)}`;
  const welcome = createWelcomeTab();
  return {
    orientation: "vertical",
    activeGroupId: newGroupId,
    groups: [
      ...layout.groups,
      { id: newGroupId, tabs: [welcome], activeTabId: welcome.id },
    ],
  };
}

export function moveTabToOtherGroup(
  layout: EditorLayout,
  tabId: string,
  fromGroupId?: string
): EditorLayout {
  const fromId = fromGroupId ?? layout.activeGroupId;
  const from = layout.groups.find((g) => g.id === fromId);
  const tab = from?.tabs.find((t) => t.id === tabId);
  if (!tab || layout.groups.length < 2) return layout;
  const to = layout.groups.find((g) => g.id !== fromId);
  if (!to) return layout;
  let next = closeTabInGroup(layout, tabId, fromId);
  next = openTabInGroup(next, tab, to.id);
  return { ...next, activeGroupId: to.id };
}

export function closeEditorGroup(layout: EditorLayout, groupId: string): EditorLayout {
  if (layout.groups.length <= 1) return layout;
  const remaining = layout.groups.filter((g) => g.id !== groupId);
  const closed = layout.groups.find((g) => g.id === groupId);
  const orphanTabs = closed?.tabs.filter((t) => t.id !== "welcome") ?? [];
  let primary = remaining[0];
  if (orphanTabs.length) {
    primary = {
      ...primary,
      tabs: [...primary.tabs, ...orphanTabs.filter((t) => !primary.tabs.find((x) => x.id === t.id))],
      activeTabId: orphanTabs[orphanTabs.length - 1]?.id ?? primary.activeTabId,
    };
    remaining[0] = primary;
  }
  return {
    orientation: remaining.length === 1 ? "single" : layout.orientation,
    groups: remaining,
    activeGroupId: primary.id,
  };
}

export function joinAllEditorGroups(layout: EditorLayout): EditorLayout {
  const allTabs: EditorTab[] = [];
  for (const g of layout.groups) {
    for (const t of g.tabs) {
      if (!allTabs.find((x) => x.id === t.id)) allTabs.push(t);
    }
  }
  const active =
    layout.groups.find((g) => g.id === layout.activeGroupId)?.activeTabId ??
    allTabs[allTabs.length - 1]?.id ??
    "welcome";
  return {
    orientation: "single",
    activeGroupId: DEFAULT_GROUP_ID,
    groups: [{ id: DEFAULT_GROUP_ID, tabs: allTabs.length ? allTabs : [createWelcomeTab()], activeTabId: active }],
  };
}

export function compareWithActive(
  layout: EditorLayout,
  tab: EditorTab
): EditorLayout {
  const next = splitEditorRight(layout);
  const otherId = next.groups.find((g) => g.id !== layout.activeGroupId)?.id ?? next.activeGroupId;
  return openTabInGroup(next, tab, otherId);
}

/** Migrate legacy flat tabs to editor layout. */
export function migrateToEditorLayout(tabs: EditorTab[], activeTabId: string | null): EditorLayout {
  if (!tabs.length) return createSingleEditorLayout();
  return {
    orientation: "single",
    groups: [{ id: DEFAULT_GROUP_ID, tabs, activeTabId: activeTabId ?? tabs[0]?.id ?? null }],
    activeGroupId: DEFAULT_GROUP_ID,
  };
}

/** Back-compat helpers for tests using flat tabs. */
export function openTab(tabs: EditorTab[], tab: EditorTab): { tabs: EditorTab[]; activeTabId: string } {
  const exists = tabs.find((t) => t.id === tab.id);
  if (exists) return { tabs, activeTabId: tab.id };
  return { tabs: [...tabs, tab], activeTabId: tab.id };
}

export function closeTab(
  tabs: EditorTab[],
  tabId: string,
  activeTabId: string | null
): { tabs: EditorTab[]; activeTabId: string | null } {
  const next = tabs.filter((t) => t.id !== tabId);
  if (activeTabId !== tabId) return { tabs: next, activeTabId };
  const idx = tabs.findIndex((t) => t.id === tabId);
  const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
  return { tabs: next, activeTabId: fallback?.id ?? null };
}

export function layoutToFlatTabs(layout: EditorLayout): { tabs: EditorTab[]; activeTabId: string | null } {
  const g = getActiveGroup(layout);
  return { tabs: g.tabs, activeTabId: g.activeTabId };
}
