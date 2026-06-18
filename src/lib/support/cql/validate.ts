/**
 * Lightweight CQL validator. CQL syntax is learned from the indexed docs, so we
 * validate structurally (balanced quotes/parentheses, recognizable
 * field-operator-value triples) rather than against a hardcoded grammar — which
 * would risk asserting syntax we can't verify. Returns issues, never throws.
 */

export interface CqlValidation {
  valid: boolean;
  issues: string[];
}

export function validateCqlStructure(cql: string): CqlValidation {
  const issues: string[] = [];
  const trimmed = cql.trim();
  if (!trimmed) return { valid: false, issues: ["Empty query."] };

  if (countUnescaped(trimmed, '"') % 2 !== 0) issues.push("Unbalanced double quotes.");
  if (countUnescaped(trimmed, "'") % 2 !== 0) issues.push("Unbalanced single quotes.");

  let depth = 0;
  for (const ch of trimmed) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) {
      issues.push("Unbalanced parentheses (extra ')').");
      break;
    }
  }
  if (depth > 0) issues.push("Unbalanced parentheses (missing ')').");

  // Reject trailing boolean operators.
  if (/\b(AND|OR|NOT)\s*$/i.test(trimmed)) issues.push("Query ends with a dangling boolean operator.");

  // Heuristic: at least one operator-ish token should be present for a non-trivial query.
  if (!/[=:<>~]|(\b(AND|OR|NOT|IN|LIKE|CONTAINS)\b)/i.test(trimmed) && trimmed.split(/\s+/).length > 1) {
    issues.push("No recognizable comparison/boolean operator found — verify against CQL docs.");
  }

  return { valid: issues.length === 0, issues };
}

function countUnescaped(s: string, quote: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === quote && s[i - 1] !== "\\") count++;
  }
  return count;
}
