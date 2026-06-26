import type { EditorTab, WorkspaceState, ActivityId, BottomPanelTab, EditorLayout } from "./types";
import { DEFAULT_LAYOUT } from "./types";
import {
  createSingleEditorLayout,
  createWelcomeTab,
  openTab as flatOpenTab,
  closeTab as flatCloseTab,
  openTabInGroup,
  closeTabInGroup,
  setActiveTabInGroup,
  getActiveGroup,
  migrateToEditorLayout,
} from "./editor-layout-state";

export {
  createWelcomeTab,
  splitEditorRight,
  splitEditorDown,
  moveTabToOtherGroup,
  closeEditorGroup,
  joinAllEditorGroups,
  compareWithActive,
  createSingleEditorLayout,
  getActiveGroup,
  openTabInGroup,
  closeTabInGroup,
  setActiveTabInGroup,
} from "./editor-layout-state";

export function activityToDefaultTab(activity: ActivityId): EditorTab | null {
  switch (activity) {
    case "investigations":
      return { id: "investigation-main", kind: "investigation", title: "Investigation" };
    case "api-registry":
      return { id: "api-registry", kind: "api-registry", title: "API Registry" };
    case "cql":
      return { id: "cql-workspace", kind: "cql", title: "CQL" };
    case "mcp":
      return { id: "mcp-config", kind: "mcp-config", title: "MCP" };
    case "settings":
      return { id: "settings", kind: "settings", title: "Settings" };
    case "chat":
      return null;
    default:
      return null;
  }
}

export function parseSlashCommand(input: string): { command: string; rest: string } | null {
  const m = input.trim().match(/^(\/\S+)(?:\s+(.*))?$/);
  if (!m) return null;
  return { command: m[1].toLowerCase(), rest: (m[2] ?? "").trim() };
}

export function initialWorkspaceState(): WorkspaceState {
  return {
    activity: "explorer",
    layout: { ...DEFAULT_LAYOUT },
    editorLayout: createSingleEditorLayout(),
    bottomTab: "problems",
    commandPaletteOpen: false,
    chatMessages: [],
    investigationSessionId: null,
    activeInvestigationId: null,
    problems: [],
  };
}

export function setBottomTab(state: WorkspaceState, tab: BottomPanelTab): WorkspaceState {
  return { ...state, bottomTab: tab, layout: { ...state.layout, bottomVisible: true } };
}

export function openTabOnLayout(
  layout: EditorLayout,
  tab: EditorTab,
  opts?: { side?: boolean; groupId?: string }
): EditorLayout {
  return openTabInGroup(layout, tab, opts?.groupId, { side: opts?.side });
}

export function hydrateEditorLayout(parsed: Partial<WorkspaceState>): EditorLayout {
  if (parsed.editorLayout?.groups?.length) return parsed.editorLayout;
  if (parsed.tabs?.length) return migrateToEditorLayout(parsed.tabs, parsed.activeTabId ?? null);
  return createSingleEditorLayout();
}

/** Legacy flat helpers for unit tests */
export function openTab(tabs: EditorTab[], tab: EditorTab) {
  return flatOpenTab(tabs, tab);
}

export function closeTab(tabs: EditorTab[], tabId: string, activeTabId: string | null) {
  return flatCloseTab(tabs, tabId, activeTabId);
}

export function closeTabOnLayout(layout: EditorLayout, tabId: string, groupId?: string): EditorLayout {
  return closeTabInGroup(layout, tabId, groupId);
}

export function setActiveTabOnLayout(layout: EditorLayout, tabId: string, groupId?: string): EditorLayout {
  return setActiveTabInGroup(layout, tabId, groupId);
}
