import "server-only";

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".npm-cache", "dist", ".vercel"]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);

export interface ProjectFileEntry {
  file: string;
  data: string;
}

/** Collect text source files from a generated app for GitHub push / Vercel API deploy. */
export function collectProjectDeployFiles(rootDir: string): ProjectFileEntry[] {
  if (!existsSync(rootDir)) return [];

  const out: ProjectFileEntry[] = [];

  function walk(dir: string, prefix: string) {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (SKIP_FILES.has(name)) continue;
      try {
        const buf = readFileSync(full);
        if (buf.includes(0)) continue;
        out.push({ file: rel.replace(/\\/g, "/"), data: buf.toString("utf8") });
      } catch {
        /* skip unreadable */
      }
    }
  }

  walk(rootDir, "");
  return out;
}
