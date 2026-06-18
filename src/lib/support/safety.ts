import type {
  PlannedAction,
  SafetyClass,
  SafetyVerdict,
  EndpointEffect,
} from "./types";

/**
 * Deterministic safety classifier for every planned action (API call, connector
 * op, or MCP tool). This is the single source of truth for "can this run, and
 * does it need approval?" — used by the approval queue, the API executor, the
 * MCP guard, and the UI previews.
 *
 * Rules (per spec §9):
 *   - GET/search/list           → READ_ONLY            (runs in read-only mode)
 *   - POST/PUT/PATCH            → WRITE_*               (approval required)
 *   - DELETE / destructive      → DESTRUCTIVE           (blocked by default)
 *   - bulk operations           → BULK_OPERATION        (approval required)
 *   - auth/permission changes   → AUTH_OR_PERMISSION_CHANGE (approval required)
 *   - Jira/GitHub/Cyware writes → approval required
 *   - MCP write tools           → approval required
 */

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DESTRUCTIVE_METHODS = new Set(["DELETE"]);

function inferEffect(method?: string, summary = ""): EndpointEffect {
  const m = (method ?? "").toUpperCase();
  const s = summary.toLowerCase();
  if (/\b(delete|remove|destroy|purge|revoke|wipe)\b/.test(s) || DESTRUCTIVE_METHODS.has(m)) {
    return "destructive";
  }
  if (/\b(bulk|batch|mass|all\s+indicators|multiple)\b/.test(s)) return "bulk";
  if (/\b(permission|role|scope|token|auth|api\s*key|credential|secret|grant)\b/.test(s)) {
    return "auth-changing";
  }
  if (READ_METHODS.has(m) || /\b(get|list|search|read|fetch|lookup|view|find)\b/.test(s)) {
    return "read";
  }
  if (m === "POST" || m === "PUT" || m === "PATCH") return "write";
  return m ? "write" : "read";
}

function writeRisk(action: PlannedAction): SafetyClass {
  const m = (action.method ?? "").toUpperCase();
  const s = action.summary.toLowerCase();
  // High-risk writes: relationships, permissions, broad object modification.
  if (/\b(relationship|link|permission|role|share|publish|merge|transition\s+to\s+(done|closed))\b/.test(s)) {
    return "WRITE_HIGH_RISK";
  }
  // Low-risk writes: comments, labels, tags, notes.
  if (/\b(comment|note|label|tag|annotate|reply)\b/.test(s)) {
    return "WRITE_LOW_RISK";
  }
  if (m === "PUT" || m === "PATCH") return "WRITE_MEDIUM_RISK";
  return "WRITE_MEDIUM_RISK";
}

export function classifyAction(action: PlannedAction): SafetyVerdict {
  const effect = action.effect ?? inferEffect(action.method, action.summary);

  switch (effect) {
    case "read":
      return {
        safetyClass: "READ_ONLY",
        requiresApproval: false,
        blocked: false,
        reason: "Read-only request (GET/search/list). Safe to execute in read-only mode.",
      };
    case "destructive":
      return {
        safetyClass: "DESTRUCTIVE",
        requiresApproval: true,
        blocked: !action.allowDestructive,
        reason: action.allowDestructive
          ? "Destructive action explicitly allowed for this provider; still requires approval."
          : "Destructive action (DELETE/remove). Blocked by default — not executable.",
      };
    case "bulk":
      return {
        safetyClass: "BULK_OPERATION",
        requiresApproval: true,
        blocked: false,
        reason: "Bulk/batch operation affecting many objects. Requires explicit approval.",
      };
    case "auth-changing":
      return {
        safetyClass: "AUTH_OR_PERMISSION_CHANGE",
        requiresApproval: true,
        blocked: false,
        reason: "Changes authentication or permissions. Requires explicit approval.",
      };
    case "write": {
      const safetyClass = writeRisk(action);
      return {
        safetyClass,
        requiresApproval: true,
        blocked: false,
        reason: `Write action (${safetyClass}). Requires explicit approval before execution.`,
      };
    }
    default:
      return {
        safetyClass: "WRITE_MEDIUM_RISK",
        requiresApproval: true,
        blocked: false,
        reason: "Unclassified action treated as a write; approval required.",
      };
  }
}

/** Convenience: classify a raw HTTP method + summary (for API/Cyware calls). */
export function classifyHttp(
  method: string,
  summary: string,
  opts: { allowDestructive?: boolean; provider?: string } = {}
): SafetyVerdict {
  return classifyAction({
    kind: "api",
    method,
    summary,
    provider: opts.provider,
    allowDestructive: opts.allowDestructive,
  });
}

/** True when the verdict permits execution given the current read-only mode. */
export function canExecute(
  verdict: SafetyVerdict,
  opts: { approved: boolean; readOnly: boolean }
): { ok: boolean; reason?: string } {
  if (verdict.blocked) return { ok: false, reason: verdict.reason };
  if (verdict.safetyClass === "READ_ONLY") return { ok: true };
  if (opts.readOnly) {
    return { ok: false, reason: "Read-only mode is enabled; write actions are disabled." };
  }
  if (verdict.requiresApproval && !opts.approved) {
    return { ok: false, reason: "Explicit approval is required before this action can run." };
  }
  return { ok: true };
}
