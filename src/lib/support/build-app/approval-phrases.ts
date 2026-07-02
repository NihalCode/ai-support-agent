import { isEditIntent } from "./edit-intent";

/** Natural-language approval to apply pending scaffold or edit diffs. */
export function isApprovalPhrase(message: string): boolean {
  const m = message.trim();
  const lower = m.toLowerCase();

  if (/^(yes|yeah|yep|approve|approved|go ahead|looks good|sounds good|do it|proceed|continue|ok|okay)\.?$/i.test(m)) {
    return true;
  }

  if (
    /\b(yes,? create|create my app|create the app|build it|build the app|now build|run the build|start building)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (/\b(apply changes|apply them|apply the changes)\b/i.test(lower)) {
    return true;
  }

  if (/^now build the app\.?$/i.test(m)) {
    return true;
  }

  return false;
}

/** User wants scaffold applied and build run immediately after approval. */
export function isBuildAfterApprovalPhrase(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(now\s+)?build(\s+the\s+app|\s+it)\b/i.test(lower) ||
    /\brun (the )?build\b/i.test(lower) ||
    /\bstart building\b/i.test(lower) ||
    /\b(yes,? create|create my app|create the app)\b/i.test(lower) ||
    /\btest my app\b/i.test(lower)
  );
}

/** Approval phrase that should not fire on edit/modification requests. */
export function isScaffoldApprovalMessage(message: string): boolean {
  if (isEditIntent(message) && !/\b(yes|approve|go ahead|looks good|build it|create it|now build)\b/i.test(message)) {
    return false;
  }
  return isApprovalPhrase(message);
}
