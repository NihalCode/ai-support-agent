const FORBIDDEN_PATTERNS = [
  /\bMCP\b/i,
  /Agent Trace/i,
  /\bTerminal\b/i,
  /RAG local/i,
  /Jira mock/i,
  /GitHub mock/i,
  /localhost/i,
  /\[object Object\]/,
  /\bundefined\b/,
  /\bnull\b/,
  /Command failed/i,
  /stack trace/i,
  /\/build-app/i,
  /next: command not found/i,
];

export function sanitizeSupportText(text: string, developerMode: boolean): string {
  if (developerMode || !text) return text;
  let out = text;
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, "");
    }
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

export function containsForbiddenSupportCopy(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}
