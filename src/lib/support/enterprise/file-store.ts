import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { supportDataRoot } from "../data-root";

export function enterpriseDataDir(subdir: string): string {
  const root = path.join(supportDataRoot(), "enterprise", subdir);
  mkdirSync(root, { recursive: true });
  return root;
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function readJsonArrayFile<T>(filePath: string): T[] {
  const data = readJsonFile<{ items?: T[] } | T[]>(filePath, []);
  if (Array.isArray(data)) return data;
  return Array.isArray(data.items) ? data.items : [];
}

export function writeJsonArrayFile<T>(filePath: string, items: T[]): void {
  writeJsonFile(filePath, { items });
}

export function defaultOrgId(): string {
  return process.env.DEFAULT_ORG_ID?.trim() || "default";
}
