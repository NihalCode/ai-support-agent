import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import type { BuildAppFileChange, BuildAppProject, BuildAppProjectStatus } from "./types";
import { supportDataRoot } from "../data-root";

const g = globalThis as unknown as { __buildAppProjects?: Map<string, BuildAppProject> };

function dataRoot(): string {
  return supportDataRoot("build-apps");
}

function store(): Map<string, BuildAppProject> {
  if (!g.__buildAppProjects) g.__buildAppProjects = new Map();
  return g.__buildAppProjects;
}

function persist(project: BuildAppProject): void {
  const dir = path.join(dataRoot(), project.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "project.json"), JSON.stringify(project, null, 2));
}

function loadFromDisk(id: string): BuildAppProject | null {
  const file = path.join(dataRoot(), id, "project.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BuildAppProject;
  } catch {
    return null;
  }
}

export function listProjects(): BuildAppProject[] {
  const ids = existsSync(dataRoot()) ? readdirSync(dataRoot()) : [];
  const out: BuildAppProject[] = [];
  for (const id of ids) {
    const p = getProject(id);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string): BuildAppProject | null {
  const mem = store().get(id);
  if (mem) return mem;
  const disk = loadFromDisk(id);
  if (disk) store().set(id, disk);
  return disk;
}

export function saveProject(project: BuildAppProject): BuildAppProject {
  project.updatedAt = new Date().toISOString();
  store().set(project.id, project);
  persist(project);
  return project;
}

export function createProject(input: {
  name: string;
  description: string;
  templateId: BuildAppProject["templateId"];
}): BuildAppProject {
  const id = crypto.randomUUID();
  const rootDir = path.join(dataRoot(), id, "app");
  mkdirSync(rootDir, { recursive: true });
  const project: BuildAppProject = {
    id,
    name: input.name,
    description: input.description,
    templateId: input.templateId,
    status: "planning",
    rootDir,
    files: [],
    pendingChanges: [],
    appliedChanges: [],
    deployments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveProject(project);
}

export function setProjectStatus(id: string, status: BuildAppProjectStatus): BuildAppProject | null {
  const p = getProject(id);
  if (!p) return null;
  p.status = status;
  return saveProject(p);
}

export function listProjectFiles(projectId: string): string[] {
  const p = getProject(projectId);
  if (!p || !existsSync(p.rootDir)) return [];
  const out: string[] = [];
  function walk(dir: string, prefix: string) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else out.push(rel.replace(/\\/g, "/"));
    }
  }
  walk(p.rootDir, "");
  return out;
}

export function readProjectFile(projectId: string, relPath: string): string | null {
  const p = getProject(projectId);
  if (!p) return null;
  const full = path.join(p.rootDir, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

export function writeProjectFile(projectId: string, relPath: string, content: string): void {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");
  const full = path.join(p.rootDir, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  p.files = listProjectFiles(projectId);
  saveProject(p);
}

export function applyFileChanges(projectId: string, changes: BuildAppFileChange[]): BuildAppProject {
  const p = getProject(projectId);
  if (!p) throw new Error("Project not found");

  for (const ch of changes) {
    const full = path.join(p.rootDir, ch.path);
    if (ch.action === "delete") {
      if (existsSync(full)) rmSync(full, { force: true });
    } else if (ch.content !== undefined) {
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, ch.content, "utf8");
    }
    p.appliedChanges.push(ch);
  }

  p.pendingChanges = [];
  p.files = listProjectFiles(projectId);
  p.status = "scaffolded";
  return saveProject(p);
}

export function setPendingChanges(projectId: string, changes: BuildAppFileChange[]): BuildAppProject | null {
  const p = getProject(projectId);
  if (!p) return null;
  p.pendingChanges = changes;
  p.status = "pending_approval";
  return saveProject(p);
}

/**
 * Restore a project from a client-supplied snapshot when the server-side store
 * has lost it (e.g. different Vercel serverless container). Re-writes all
 * scaffolded source files from appliedChanges so build/deploy can proceed.
 */
export function restoreProjectFromSnapshot(snapshot: BuildAppProject): BuildAppProject {
  // Fix rootDir to point at *this* container's /tmp (or .data in dev).
  const correctRoot = path.join(dataRoot(), snapshot.id, "app");
  const restored: BuildAppProject = {
    ...snapshot,
    rootDir: correctRoot,
    updatedAt: new Date().toISOString(),
  };

  mkdirSync(correctRoot, { recursive: true });

  // Re-write every applied file so build tools can find them.
  for (const ch of restored.appliedChanges ?? []) {
    if (ch.action === "delete") continue;
    if (ch.content === undefined) continue;
    const full = path.join(correctRoot, ch.path);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, ch.content, "utf8");
  }

  restored.files = listProjectFilesFromDir(correctRoot);
  return saveProject(restored);
}

function listProjectFilesFromDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  function walk(d: string, prefix: string) {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else out.push(rel.replace(/\\/g, "/"));
    }
  }
  walk(dir, "");
  return out;
}
