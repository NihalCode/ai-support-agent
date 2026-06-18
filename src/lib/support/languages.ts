/** File language detection + ingestion filters (shared by connectors + chunker). */

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  swift: "swift",
  scala: "scala",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  toml: "toml",
  ini: "ini",
  env: "dotenv",
  md: "markdown",
  mdx: "markdown",
  txt: "text",
  html: "html",
  css: "css",
  scss: "css",
};

const CONFIG_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "next.config.js",
  ".env.example",
  "dockerfile",
  "docker-compose.yml",
  "vercel.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "cargo.toml",
]);

const SKIP_DIRS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "vendor/",
  "__pycache__/",
  ".venv/",
];

const SKIP_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf", "zip", "gz", "tar",
  "lock", "woff", "woff2", "ttf", "eot", "mp4", "mp3", "wasm", "map", "min.js",
]);

export function extOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function languageFromPath(path: string): string {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (CONFIG_FILES.has(base)) return base.endsWith(".json") ? "json" : "config";
  return EXT_LANG[extOf(path)] ?? "text";
}

export function isConfigFile(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  return CONFIG_FILES.has(base) || base.startsWith(".env");
}

export function isDocFile(path: string): boolean {
  const ext = extOf(path);
  return ext === "md" || ext === "mdx" || path.toLowerCase().startsWith("docs/");
}

export function isIngestableFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (SKIP_DIRS.some((d) => lower.includes(d))) return false;
  if (lower.endsWith(".min.js") || lower.endsWith(".d.ts")) return false;
  const ext = extOf(path);
  if (SKIP_EXT.has(ext)) return false;
  const base = lower.split("/").pop() ?? lower;
  if (CONFIG_FILES.has(base) || base.startsWith(".env")) return true;
  return Boolean(EXT_LANG[ext]);
}

export function isProbablyBinary(content: string): boolean {
  // A NUL byte or a high ratio of control chars suggests binary content.
  if (content.includes("\u0000")) return true;
  let control = 0;
  const sample = content.slice(0, 1000);
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code < 9 || (code > 13 && code < 32)) control++;
  }
  return control / Math.max(sample.length, 1) > 0.3;
}
