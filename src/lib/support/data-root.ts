import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

/** Writable data directory — uses /tmp on Vercel serverless. */
export function supportDataRoot(subdir?: string): string {
  const base = resolveSupportDataRoot();
  const root = subdir ? path.join(base, subdir) : base;
  mkdirSync(root, { recursive: true });
  return root;
}

function resolveSupportDataRoot(): string {
  if (process.env.SUPPORT_DATA_DIR) return process.env.SUPPORT_DATA_DIR;
  const cwd = process.cwd();
  if (process.env.VERCEL === "1" || cwd === "/var/task" || cwd.startsWith("/var/task/")) {
    return path.join("/tmp", "ai-support-agent");
  }
  return path.join(/* turbopackIgnore: true */ cwd, ".data");
}
