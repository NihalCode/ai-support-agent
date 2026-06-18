import type { NormalizedIssue } from "./types";

/** True when the client gave almost no detail (non-technical one-liner). */
export function isLowInfoDescription(description: string): boolean {
  const words = description.trim().split(/\s+/).filter(Boolean);
  return (
    words.length < 5 &&
    !(
      /[A-Z][A-Z0-9_]{2,}/.test(description) ||
      /\b\d{3}\b/.test(description) ||
      /gh#\d+/i.test(description)
    )
  );
}

/**
 * Non-technical users often paste only an issue number or a short sentence.
 * When we have a linked ticket, expand the working text from its title/body/comments.
 */
export function expandClientDescription(
  description: string,
  issue: NormalizedIssue | null | undefined
): string {
  const trimmed = description.trim();
  if (!issue) return trimmed;

  const issueText = [
    issue.title,
    issue.body,
    ...(issue.comments ?? []).map((c) => `${c.author}: ${c.body}`),
  ]
    .filter(Boolean)
    .join("\n");

  if (!trimmed || isLowInfoDescription(trimmed)) {
    return issueText;
  }
  return `${trimmed}\n\n--- linked ticket ---\n${issueText}`;
}
