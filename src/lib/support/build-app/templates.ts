import "server-only";

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import type { BuildAppTemplateId, BuildAppTemplateManifest } from "./types";

const TEMPLATES_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "templates");

const BUILT_IN: BuildAppTemplateManifest[] = [
  {
    id: "blank-next-app",
    name: "Blank Next.js App",
    description: "Minimal Next.js starter with server-side API route pattern.",
    products: ["CTIX", "CSAP", "Orchestrate", "CFTR"],
    keywords: ["blank", "starter", "minimal"],
  },
  {
    id: "cyware-api-dashboard",
    name: "Cyware API Dashboard",
    description: "Generic dashboard shell for Cyware API data.",
    products: ["CTIX", "CSAP"],
    keywords: ["dashboard", "api", "cyware"],
    defaultEndpoints: [{ method: "GET", path: "/v3/indicators/", name: "List indicators", product: "CTIX" }],
  },
  {
    id: "cql-search-app",
    name: "CQL Search App",
    description: "CQL query input with results table and validation.",
    products: ["CTIX"],
    keywords: ["cql", "query", "filter", "search"],
    defaultEndpoints: [{ method: "GET", path: "/v3/indicators/", name: "Indicator search", product: "CTIX" }],
  },
  {
    id: "indicator-search-dashboard",
    name: "Indicator Search Dashboard",
    description: "Search box, optional CQL filter, results table, and details panel.",
    products: ["CTIX"],
    keywords: ["indicator", "search", "dashboard", "ip", "ioc"],
    defaultEndpoints: [
      { method: "GET", path: "/v3/indicators/", name: "Indicator search", product: "CTIX" },
      { method: "GET", path: "/v3/indicators/{id}/", name: "Indicator details", product: "CTIX" },
    ],
  },
  {
    id: "case-management-dashboard",
    name: "Case Management Dashboard",
    description: "CSAP/CFTR case list and detail views.",
    products: ["CSAP", "CFTR"],
    keywords: ["case", "management", "incident", "csap", "cftr"],
    defaultEndpoints: [{ method: "GET", path: "/api/cases/", name: "List cases", product: "CFTR" }],
  },
  {
    id: "orchestrate-workflow-dashboard",
    name: "Orchestrate Workflow Dashboard",
    description: "Workflow execution status and run history.",
    products: ["Orchestrate"],
    keywords: ["orchestrate", "workflow", "playbook", "automation"],
    defaultEndpoints: [{ method: "GET", path: "/api/workflows/", name: "List workflows", product: "Orchestrate" }],
  },
  {
    id: "api-playground-app",
    name: "API Playground",
    description: "Interactive API explorer with form-generated payloads.",
    products: ["CTIX", "CSAP", "Orchestrate", "CFTR"],
    keywords: ["playground", "api", "explorer", "test"],
  },
  {
    id: "support-portal-app",
    name: "Support Portal",
    description: "Customer-facing support portal with ticket submission.",
    products: ["CSAP"],
    keywords: ["support", "portal", "ticket", "customer"],
  },
];

export function listTemplates(): BuildAppTemplateManifest[] {
  return BUILT_IN.map((t) => {
    const manifestPath = path.join(TEMPLATES_ROOT, t.id, "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        return { ...t, ...JSON.parse(readFileSync(manifestPath, "utf8")) } as BuildAppTemplateManifest;
      } catch {
        return t;
      }
    }
    return t;
  });
}

export function getTemplate(id: BuildAppTemplateId): BuildAppTemplateManifest | null {
  return listTemplates().find((t) => t.id === id) ?? null;
}

export function templateDir(id: BuildAppTemplateId): string {
  return path.join(TEMPLATES_ROOT, id);
}

/** List all files under templates/{id}/files recursively. */
export function listTemplateFiles(id: BuildAppTemplateId): string[] {
  const base = path.join(templateDir(id), "files");
  if (!existsSync(base)) return [];
  const out: string[] = [];
  function walk(dir: string, prefix: string) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else out.push(rel.replace(/\\/g, "/"));
    }
  }
  walk(base, "");
  return out;
}

export function readTemplateFile(id: BuildAppTemplateId, relPath: string): string {
  const full = path.join(templateDir(id), "files", relPath);
  return readFileSync(full, "utf8");
}

export function resolveTemplateFiles(
  id: BuildAppTemplateId,
  vars: Record<string, string>
): { path: string; content: string }[] {
  const blank = resolveTemplateFilesOnly("blank-next-app", vars);
  if (id === "blank-next-app") return blank;

  const overlay = resolveTemplateFilesOnly(id, vars);
  const map = new Map(blank.map((f) => [f.path, f.content]));
  for (const f of overlay) map.set(f.path, f.content);
  return [...map.entries()].map(([path, content]) => ({ path, content }));
}

function resolveTemplateFilesOnly(
  id: BuildAppTemplateId,
  vars: Record<string, string>
): { path: string; content: string }[] {
  const files = listTemplateFiles(id);
  return files.map((rel) => ({
    path: rel,
    content: substituteVars(readTemplateFile(id, rel), vars),
  }));
}

export function substituteVars(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

export function ensureTemplateOnDisk(id: BuildAppTemplateId): void {
  const dir = path.join(templateDir(id), "files");
  if (existsSync(dir) && listTemplateFiles(id).length > 0) return;
  mkdirSync(dir, { recursive: true });
  const blank = path.join(TEMPLATES_ROOT, "blank-next-app", "files");
  if (id !== "blank-next-app" && existsSync(blank)) {
    cpSync(blank, dir, { recursive: true });
  }
}
