import "server-only";

import { collectProjectDeployFiles } from "./collect-files";
import type { CommandResult } from "./command-runner";

export async function runWorkerRemoteBuild(
  projectId: string,
  rootDir: string
): Promise<{ ok: boolean; output: string; commands: CommandResult[] }> {
  const workerUrl = process.env.BUILD_APP_BUILD_WORKER_URL?.trim();
  if (!workerUrl) {
    return { ok: false, output: "BUILD_APP_BUILD_WORKER_URL is not set.", commands: [] };
  }

  const files = collectProjectDeployFiles(rootDir);
  const startedAt = new Date().toISOString();

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, files }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      buildOk?: boolean;
      output?: string;
      error?: string;
    };

    const finishedAt = new Date().toISOString();
    const passed = res.ok && (data.buildOk ?? data.ok) === true;
    const output = data.output ?? data.error ?? (passed ? "Remote build passed." : "Remote build failed.");

    return {
      ok: passed,
      output: `[REMOTE BUILD WORKER]\n${output}`,
      commands: [
        {
          command: `POST ${workerUrl}`,
          cwd: rootDir,
          exitCode: passed ? 0 : 1,
          stdout: passed ? output : "",
          stderr: passed ? "" : output,
          startedAt,
          finishedAt,
          status: passed ? "success" : "failed",
          mock: false,
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      output: `[REMOTE BUILD WORKER ERROR]\n${msg}`,
      commands: [],
    };
  }
}
