export type EditIntentKind =
  | "clean_ui"
  | "remove_prompt"
  | "add_filter"
  | "change_title"
  | "fix_build"
  | "explain"
  | "unknown";

export interface EditIntent {
  kind: EditIntentKind;
  isEdit: boolean;
  label: string;
}

const EDIT_PATTERNS: { kind: EditIntentKind; re: RegExp; label: string }[] = [
  { kind: "remove_prompt", re: /\b(remove|delete|drop|hide|get rid of).*(text|prompt|title|heading|that|this)/i, label: "Remove unwanted text" },
  { kind: "remove_prompt", re: /\b(should not be there|don't show|do not show|not be there)\b/i, label: "Remove landing page text" },
  { kind: "clean_ui", re: /\b(cleaner|clean up|cleaner ui|make it clean|less cluttered|professional|modern|prettier|polish|improve|better ui|real product|presentable|client[- ]presentable)\b/i, label: "Clean up UI" },
  { kind: "clean_ui", re: /\b(make|improve|fix|update).*(ui|layout|design|look|landing page|dashboard|page)\b/i, label: "Improve UI" },
  { kind: "add_filter", re: /\b(add|include|enable).*(filter|cql)\b/i, label: "Add filter" },
  { kind: "change_title", re: /\b(change|update|rename).*(title|heading|name)\b/i, label: "Change title" },
  { kind: "fix_build", re: /\b(build fail|build error|npm run build|turbopack|ecmascript|fix (the|this) build|why (the|this) error|error occurred)\b/i, label: "Fix build error" },
  { kind: "explain", re: /\b(explain|how does|what does|simple terms|in plain english|tell me why|why (the|this) error)\b/i, label: "Explain" },
];

export function classifyEditIntent(message: string): EditIntent {
  for (const p of EDIT_PATTERNS) {
    if (p.re.test(message)) {
      return { kind: p.kind, isEdit: p.kind !== "explain", label: p.label };
    }
  }
  if (/^(make it cleaner|cleaner|make the ui cleaner|make ui cleaner|make the ui clean)$/i.test(message.trim())) {
    return { kind: "clean_ui", isEdit: true, label: "Clean up UI" };
  }

  if (/\b(remove|delete|drop|hide|get rid of)\b.*\b(that|this|it|text|prompt)\b/i.test(message)) {
    return { kind: "remove_prompt", isEdit: true, label: "Remove unwanted text" };
  }

  return { kind: "unknown", isEdit: false, label: "Unknown" };
}

export function isEditIntent(message: string): boolean {
  const intent = classifyEditIntent(message);
  if (intent.isEdit) return true;
  // Any change/fix/improve request when not explain-only
  return /\b(change|fix|update|remove|add|improve|clean|modern|professional|filter|title|layout|clutter)\b/i.test(
    message
  );
}
