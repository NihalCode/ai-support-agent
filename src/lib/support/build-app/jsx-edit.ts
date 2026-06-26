import "server-only";

/** Safely add a CSS class to the <main> element without duplicating className. */
export function addMainShellClass(content: string, shellClass = "dashboard-shell"): string | null {
  if (!content.includes("<main")) return null;
  if (new RegExp(`className="[^"]*\\b${shellClass}\\b`).test(content)) return null;

  const withExisting = content.replace(
    /(<main\b[^>]*\bclassName=")([^"]*)(")/,
    (_m, pre: string, classes: string, post: string) => `${pre}${classes} ${shellClass}${post}`
  );
  if (withExisting !== content) return withExisting;

  const withNew = content.replace(/<main\b/, `<main className="${shellClass}"`);
  if (withNew !== content) return withNew;

  return null;
}
