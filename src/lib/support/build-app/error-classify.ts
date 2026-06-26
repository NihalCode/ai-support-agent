import "server-only";

export interface BuildErrorClassification {
  kind: "missing_command" | "missing_module" | "typescript" | "syntax" | "env_var" | "preflight" | "unknown";
  summary: string;
  suggestedFix: string;
}

export function classifyBuildError(output: string): BuildErrorClassification {
  const text = output.toLowerCase();

  if (/next:\s*command not found|sh:.*next: not found|cannot find module 'next'/.test(text)) {
    return {
      kind: "missing_command",
      summary: "The Next.js CLI is not installed in the generated app.",
      suggestedFix: "Run npm install in the generated app folder and ensure next, react, and react-dom are listed in package.json dependencies.",
    };
  }

  if (/cannot find module|module not found|can't resolve/.test(text)) {
    return {
      kind: "missing_module",
      summary: "A required npm package or import path is missing.",
      suggestedFix: "Add the missing dependency to package.json and re-run npm install, or fix the import path in the scaffolded file.",
    };
  }

  if (/typescript error|ts\d{4}:|type error/.test(text)) {
    return {
      kind: "typescript",
      summary: "TypeScript reported compile errors.",
      suggestedFix: "Fix the reported type errors in the generated source files, then re-run the build.",
    };
  }

  if (/parsing ecmascript|parse error|unexpected token|syntax error|failed to parse/.test(text)) {
    return {
      kind: "syntax",
      summary: "A generated source file has invalid JavaScript/JSX syntax.",
      suggestedFix:
        "Fix duplicate JSX attributes, unfinished template placeholders, or the cited syntax error in the source file, then re-run the build.",
    };
  }

  if (/env|environment variable|process\.env/.test(text) && /required|missing|undefined/.test(text)) {
    return {
      kind: "env_var",
      summary: "Build failed because a required environment variable is missing.",
      suggestedFix: "Use mock/test values at build time or document the variable in .env.local.example without requiring secrets during build.",
    };
  }

  if (/preflight failed|package\.json is missing|no app\//.test(text)) {
    return {
      kind: "preflight",
      summary: "The generated app is incomplete.",
      suggestedFix: "Re-run scaffold approval or regenerate missing files before building.",
    };
  }

  return {
    kind: "unknown",
    summary: "The build command failed.",
    suggestedFix: "Review the command output, apply a fix, and re-run the build.",
  };
}
