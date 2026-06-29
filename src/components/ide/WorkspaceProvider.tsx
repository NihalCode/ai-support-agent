"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityId,
  BottomPanelTab,
  ChatMessage,
  EditorTab,
  ToolCallCardState,
  WorkspaceState,
} from "./types";
import {
  activityToDefaultTab,
  initialWorkspaceState,
  parseSlashCommand,
  openTabOnLayout,
  closeTabOnLayout,
  setActiveTabOnLayout,
  hydrateEditorLayout,
  splitEditorRight,
  splitEditorDown,
  moveTabToOtherGroup,
  closeEditorGroup,
  joinAllEditorGroups,
  compareWithActive,
  getActiveGroup,
} from "./workspace-state";
import { SLASH_COMMANDS } from "./types";
import {
  clientLayoutDefaults,
  developerLayoutDefaults,
  productConfig,
  readStoredProductMode,
  PRODUCT_MODE_STORAGE_KEY,
  type ProductMode,
} from "@/lib/product-config";
import { useAuth } from "@/components/auth/AuthProvider";

const STORAGE_KEY = "ai-support-ide-layout-v2";

type Action =
  | { type: "SET_ACTIVITY"; activity: ActivityId }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "TOGGLE_CHAT" }
  | { type: "TOGGLE_BOTTOM" }
  | { type: "SET_LAYOUT"; partial: Partial<WorkspaceState["layout"]> }
  | { type: "OPEN_TAB"; tab: EditorTab; side?: boolean; groupId?: string }
  | { type: "CLOSE_TAB"; tabId: string; groupId?: string }
  | { type: "SET_ACTIVE_TAB"; tabId: string; groupId?: string }
  | { type: "SET_ACTIVE_GROUP"; groupId: string }
  | { type: "SPLIT_RIGHT"; groupId?: string }
  | { type: "SPLIT_DOWN"; groupId?: string }
  | { type: "MOVE_TAB_OTHER"; tabId: string; groupId?: string }
  | { type: "CLOSE_GROUP"; groupId: string }
  | { type: "JOIN_GROUPS" }
  | { type: "COMPARE_ACTIVE"; tab: EditorTab }
  | { type: "SET_BOTTOM_TAB"; tab: BottomPanelTab }
  | { type: "SET_COMMAND_PALETTE"; open: boolean }
  | { type: "ADD_CHAT"; message: ChatMessage }
  | { type: "UPDATE_CHAT"; id: string; patch: Partial<ChatMessage> }
  | { type: "SET_INVESTIGATION"; sessionId: string | null }
  | { type: "SET_ACTIVE_INVESTIGATION"; id: string | null }
  | { type: "SET_ACTIVE_BUILD_PROJECT"; id: string | null }
  | { type: "SET_PROBLEMS"; problems: WorkspaceState["problems"] }
  | { type: "HYDRATE"; state: Partial<WorkspaceState> };

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "SET_ACTIVITY": {
      const tab = activityToDefaultTab(action.activity);
      if (!tab) return { ...state, activity: action.activity };
      return {
        ...state,
        activity: action.activity,
        editorLayout: openTabOnLayout(state.editorLayout, tab),
      };
    }
    case "TOGGLE_SIDEBAR":
      return { ...state, layout: { ...state.layout, sidebarVisible: !state.layout.sidebarVisible } };
    case "TOGGLE_CHAT":
      return { ...state, layout: { ...state.layout, chatVisible: !state.layout.chatVisible } };
    case "TOGGLE_BOTTOM":
      return { ...state, layout: { ...state.layout, bottomVisible: !state.layout.bottomVisible } };
    case "SET_LAYOUT":
      return { ...state, layout: { ...state.layout, ...action.partial } };
    case "OPEN_TAB":
      return {
        ...state,
        editorLayout: openTabOnLayout(state.editorLayout, action.tab, {
          side: action.side,
          groupId: action.groupId,
        }),
      };
    case "CLOSE_TAB":
      return {
        ...state,
        editorLayout: closeTabOnLayout(state.editorLayout, action.tabId, action.groupId),
      };
    case "SET_ACTIVE_TAB":
      return {
        ...state,
        editorLayout: setActiveTabOnLayout(state.editorLayout, action.tabId, action.groupId),
      };
    case "SET_ACTIVE_GROUP":
      return {
        ...state,
        editorLayout: { ...state.editorLayout, activeGroupId: action.groupId },
      };
    case "SPLIT_RIGHT":
      return { ...state, editorLayout: splitEditorRight(state.editorLayout, action.groupId) };
    case "SPLIT_DOWN":
      return { ...state, editorLayout: splitEditorDown(state.editorLayout, action.groupId) };
    case "MOVE_TAB_OTHER":
      return {
        ...state,
        editorLayout: moveTabToOtherGroup(state.editorLayout, action.tabId, action.groupId),
      };
    case "CLOSE_GROUP":
      return { ...state, editorLayout: closeEditorGroup(state.editorLayout, action.groupId) };
    case "JOIN_GROUPS":
      return { ...state, editorLayout: joinAllEditorGroups(state.editorLayout) };
    case "COMPARE_ACTIVE":
      return { ...state, editorLayout: compareWithActive(state.editorLayout, action.tab) };
    case "SET_BOTTOM_TAB":
      return { ...state, bottomTab: action.tab, layout: { ...state.layout, bottomVisible: true } };
    case "SET_COMMAND_PALETTE":
      return { ...state, commandPaletteOpen: action.open };
    case "ADD_CHAT":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case "UPDATE_CHAT":
      return {
        ...state,
        chatMessages: state.chatMessages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m
        ),
      };
    case "SET_INVESTIGATION":
      return { ...state, investigationSessionId: action.sessionId };
    case "SET_ACTIVE_INVESTIGATION":
      return { ...state, activeInvestigationId: action.id };
    case "SET_ACTIVE_BUILD_PROJECT":
      return { ...state, activeBuildProjectId: action.id };
    case "SET_PROBLEMS":
      return { ...state, problems: action.problems };
    case "HYDRATE":
      return {
        ...state,
        ...action.state,
        layout: { ...state.layout, ...action.state.layout },
        editorLayout: action.state.editorLayout ?? hydrateEditorLayout(action.state),
      };
    default:
      return state;
  }
}

export interface WorkspaceContextValue {
  state: WorkspaceState;
  setActivity: (a: ActivityId) => void;
  openTab: (tab: EditorTab, opts?: { side?: boolean; groupId?: string }) => void;
  openTabFromTarget: (target: { kind: string; tabId: string; title: string; payload?: Record<string, unknown> }, side?: boolean) => void;
  closeTab: (id: string, groupId?: string) => void;
  setActiveTab: (id: string, groupId?: string) => void;
  setActiveGroup: (groupId: string) => void;
  splitEditorRight: (groupId?: string) => void;
  splitEditorDown: (groupId?: string) => void;
  moveTabToOtherGroup: (tabId: string, groupId?: string) => void;
  closeEditorGroup: (groupId: string) => void;
  joinAllEditorGroups: () => void;
  compareWithActive: (tab: EditorTab) => void;
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleBottom: () => void;
  setBottomTab: (t: BottomPanelTab) => void;
  setCommandPalette: (open: boolean) => void;
  addChatMessage: (msg: Omit<ChatMessage, "id" | "at">) => string;
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setInvestigationSession: (id: string | null) => void;
  setActiveInvestigation: (id: string | null) => void;
  setActiveBuildProject: (id: string | null) => void;
  pinEvidenceToInvestigation: (evidenceId: string, evidence?: Record<string, unknown>) => Promise<void>;
  setProblems: (p: WorkspaceState["problems"]) => void;
  runCommand: (commandId: string) => void;
  handleSlashInput: (input: string) => boolean;
  setLayoutSize: (partial: Partial<WorkspaceState["layout"]>) => void;
  productMode: ProductMode;
  isClientMode: boolean;
  setProductMode: (mode: ProductMode) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialWorkspaceState);
  const [productMode, setProductModeState] = useState<ProductMode>(productConfig.defaultMode);
  const { canUseDeveloperMode } = useAuth();

  useEffect(() => {
    const stored = readStoredProductMode();
    if (stored === "developer" && !canUseDeveloperMode) {
      setProductModeState("client");
      return;
    }
    setProductModeState(stored);
  }, [canUseDeveloperMode]);

  const setProductMode = useCallback(
    (mode: ProductMode) => {
      const next = mode === "developer" && !canUseDeveloperMode ? "client" : mode;
      setProductModeState(next);
      try {
        localStorage.setItem(PRODUCT_MODE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      const layoutPatch = next === "developer" ? developerLayoutDefaults() : clientLayoutDefaults();
      dispatch({ type: "SET_LAYOUT", partial: layoutPatch });
      if (next === "client") {
        dispatch({ type: "SET_ACTIVITY", activity: "home" });
      }
    },
    [canUseDeveloperMode]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
        dispatch({
          type: "HYDRATE",
          state: {
            layout: parsed.layout,
            editorLayout: hydrateEditorLayout(parsed),
          },
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ layout: state.layout, editorLayout: state.editorLayout })
      );
    } catch {
      /* ignore */
    }
  }, [state.layout, state.editorLayout]);

  useEffect(() => {
    fetch("/api/support/status")
      .then((r) => r.json())
      .then((s) => {
        if (readStoredProductMode() === "client") {
          dispatch({ type: "SET_PROBLEMS", problems: [] });
          return;
        }
        const problems: WorkspaceState["problems"] = [];
        const integ = s.integrations ?? {};
        if (!integ.jira?.configured) problems.push({ id: "jira", severity: "warn", message: "Jira credentials missing — ticket search uses mock data." });
        if (!integ.github?.configured) problems.push({ id: "github", severity: "warn", message: "GitHub token missing — code search uses mock data." });
        if (!integ.pinecone?.configured) problems.push({ id: "pinecone", severity: "warn", message: "Pinecone not configured — semantic search uses local vector store." });
        if (!integ.openai?.configured) problems.push({ id: "openai", severity: "warn", message: "OpenAI key missing — heuristic analysis mode." });
        if (!integ.vercel?.configured) problems.push({ id: "vercel", severity: "warn", message: "Vercel logs unavailable — mock deployment events." });
        dispatch({ type: "SET_PROBLEMS", problems });
      })
      .catch(() => undefined);
    fetch("/api/support/bootstrap", { method: "POST" }).catch(() => undefined);
  }, []);

  const runCommand = useCallback((commandId: string) => {
    dispatch({ type: "SET_COMMAND_PALETTE", open: false });
    switch (commandId) {
      case "split-right":
        dispatch({ type: "SPLIT_RIGHT" });
        break;
      case "split-down":
        dispatch({ type: "SPLIT_DOWN" });
        break;
      case "join-groups":
        dispatch({ type: "JOIN_GROUPS" });
        break;
      case "investigate":
      case "start-investigation":
        dispatch({ type: "OPEN_TAB", tab: { id: "investigation-main", kind: "investigation", title: "Investigation" } });
        dispatch({ type: "SET_ACTIVITY", activity: "investigations" });
        break;
      case "diagnose":
        dispatch({ type: "OPEN_TAB", tab: { id: "diagnose", kind: "diagnose", title: "Diagnose" } });
        break;
      case "import-api":
        dispatch({ type: "OPEN_TAB", tab: { id: "integrations", kind: "integrations", title: "Integrations" } });
        dispatch({ type: "SET_ACTIVITY", activity: "explorer" });
        break;
      case "api-registry":
        dispatch({ type: "OPEN_TAB", tab: { id: "api-registry", kind: "api-registry", title: "API Registry" } });
        dispatch({ type: "SET_ACTIVITY", activity: "api-registry" });
        break;
      case "api-runner":
        dispatch({ type: "OPEN_TAB", tab: { id: "api-runner", kind: "api-runner", title: "API Runner" } });
        break;
      case "cql":
        dispatch({ type: "OPEN_TAB", tab: { id: "cql-workspace", kind: "cql", title: "CQL" } });
        dispatch({ type: "SET_ACTIVITY", activity: "cql" });
        break;
      case "build-app":
        dispatch({ type: "OPEN_TAB", tab: { id: "build-app-new", kind: "build-app", title: "Build App" } });
        dispatch({ type: "SET_ACTIVITY", activity: "build-app" });
        break;
      case "deployments":
        dispatch({ type: "OPEN_TAB", tab: { id: "deployments", kind: "deployments", title: "Deployments" } });
        dispatch({ type: "SET_ACTIVITY", activity: "deployments" });
        break;
      case "jira":
        dispatch({ type: "SET_ACTIVITY", activity: "jira" });
        dispatch({ type: "OPEN_TAB", tab: { id: "jira-search", kind: "jira-ticket", title: "Jira" } });
        break;
      case "logs":
        dispatch({ type: "SET_ACTIVITY", activity: "logs" });
        break;
      case "mcp":
        dispatch({ type: "OPEN_TAB", tab: { id: "mcp-config", kind: "mcp-config", title: "MCP" } });
        dispatch({ type: "SET_ACTIVITY", activity: "mcp" });
        break;
      case "credentials":
      case "settings":
        dispatch({ type: "OPEN_TAB", tab: { id: "settings", kind: "settings", title: "Settings" } });
        dispatch({ type: "SET_ACTIVITY", activity: "settings" });
        break;
      case "toggle-sidebar":
        dispatch({ type: "TOGGLE_SIDEBAR" });
        break;
      case "toggle-bottom":
        dispatch({ type: "TOGGLE_BOTTOM" });
        break;
      case "toggle-chat":
        dispatch({ type: "TOGGLE_CHAT" });
        break;
      case "search":
        dispatch({ type: "SET_ACTIVITY", activity: "search" });
        break;
      case "home":
        dispatch({ type: "SET_ACTIVITY", activity: "home" });
        break;
      default:
        break;
    }
  }, []);

  const handleSlashInput = useCallback(
    (input: string) => {
      const parsed = parseSlashCommand(input);
      if (!parsed) return false;
      const match = SLASH_COMMANDS.find((c) => c.cmd === parsed.command);
      if (!match) return false;
      runCommand(match.action);
      if (parsed.rest) {
        dispatch({
          type: "ADD_CHAT",
          message: { id: crypto.randomUUID(), role: "user", content: input, at: new Date().toISOString() },
        });
      }
      return true;
    },
    [runCommand]
  );

  const pinEvidenceToInvestigation = useCallback(
    async (evidenceId: string, evidence?: Record<string, unknown>) => {
      let invId = state.activeInvestigationId;
      if (!invId) {
        const res = await fetch("/api/support/investigations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Active investigation",
            userIssue: "Pinned from workspace",
          }),
        });
        const inv = await res.json();
        invId = inv.id;
        dispatch({ type: "SET_ACTIVE_INVESTIGATION", id: invId });
      }
      await fetch(`/api/support/investigations?id=${encodeURIComponent(invId!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinEvidence: evidenceId,
          evidence: evidence
            ? [
                {
                  id: evidenceId,
                  sourceType: String(evidence.sourceType ?? "unknown"),
                  sourceName: String(evidence.sourceName ?? "Workspace"),
                  title: String(evidence.title ?? evidenceId),
                  summary: String(evidence.matchedText ?? evidence.summary ?? ""),
                  timestamp: new Date().toISOString(),
                  openTarget: evidence.openTarget,
                },
              ]
            : undefined,
        }),
      });
    },
    [state.activeInvestigationId]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      setActivity: (activity) => dispatch({ type: "SET_ACTIVITY", activity }),
      openTab: (tab, opts) =>
        dispatch({ type: "OPEN_TAB", tab, side: opts?.side, groupId: opts?.groupId }),
      openTabFromTarget: (target, side) =>
        dispatch({
          type: "OPEN_TAB",
          tab: {
            id: target.tabId,
            kind: target.kind as EditorTab["kind"],
            title: target.title,
            payload: target.payload,
          },
          side,
        }),
      closeTab: (id, groupId) => dispatch({ type: "CLOSE_TAB", tabId: id, groupId }),
      setActiveTab: (id, groupId) => dispatch({ type: "SET_ACTIVE_TAB", tabId: id, groupId }),
      setActiveGroup: (groupId) => dispatch({ type: "SET_ACTIVE_GROUP", groupId }),
      splitEditorRight: (groupId) => dispatch({ type: "SPLIT_RIGHT", groupId }),
      splitEditorDown: (groupId) => dispatch({ type: "SPLIT_DOWN", groupId }),
      moveTabToOtherGroup: (tabId, groupId) =>
        dispatch({ type: "MOVE_TAB_OTHER", tabId, groupId }),
      closeEditorGroup: (groupId) => dispatch({ type: "CLOSE_GROUP", groupId }),
      joinAllEditorGroups: () => dispatch({ type: "JOIN_GROUPS" }),
      compareWithActive: (tab) => dispatch({ type: "COMPARE_ACTIVE", tab }),
      toggleSidebar: () => dispatch({ type: "TOGGLE_SIDEBAR" }),
      toggleChat: () => dispatch({ type: "TOGGLE_CHAT" }),
      toggleBottom: () => dispatch({ type: "TOGGLE_BOTTOM" }),
      setBottomTab: (tab) => dispatch({ type: "SET_BOTTOM_TAB", tab }),
      setCommandPalette: (open) => dispatch({ type: "SET_COMMAND_PALETTE", open }),
      addChatMessage: (msg) => {
        const id = crypto.randomUUID();
        dispatch({
          type: "ADD_CHAT",
          message: { ...msg, id, at: new Date().toISOString() },
        });
        return id;
      },
      updateChatMessage: (id, patch) => dispatch({ type: "UPDATE_CHAT", id, patch }),
      setInvestigationSession: (id) => dispatch({ type: "SET_INVESTIGATION", sessionId: id }),
      setActiveInvestigation: (id) => dispatch({ type: "SET_ACTIVE_INVESTIGATION", id: id }),
      setActiveBuildProject: (id) => dispatch({ type: "SET_ACTIVE_BUILD_PROJECT", id: id }),
      pinEvidenceToInvestigation,
      setProblems: (p) => dispatch({ type: "SET_PROBLEMS", problems: p }),
      runCommand,
      handleSlashInput,
      setLayoutSize: (partial) => dispatch({ type: "SET_LAYOUT", partial }),
      productMode,
      isClientMode: productMode === "client",
      setProductMode,
    }),
    [state, runCommand, handleSlashInput, pinEvidenceToInvestigation, productMode, setProductMode]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export { getActiveGroup };
