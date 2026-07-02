import "server-only";

import type { CommandResult } from "./command-runner";
import { deployToVercelApi } from "./vercel-api-deploy";
import { resolveBuildAppCredentials } from "./credentials";
import type { BuildAppProject } from "./types";
import { saveProject } from "./project-store";

export async function runVercelRemoteBuild(
  projectId: string,
  p: BuildAppProject
): Promise<{
  ok: boolean;
  output: string;
  commands: CommandResult[];
  previewUrl?: string;
}> {
  const creds = resolveBuildAppCredentials();
  const token = creds.vercelToken;
  if (!token) {
    return {
      ok: false,
      output: "Vercel token required for remote build.",
      commands: [],
    };
  }

  const startedAt = new Date().toISOString();
  try {
    const result = await deployToVercelApi({
      token,
      teamId: creds.vercelTeamId,
      projectName: p.name,
      rootDir: p.rootDir,
      target: "preview",
    });

    const finishedAt = new Date().toISOString();
    const command: CommandResult = {
      command: "vercel deploy (remote build verification)",
      cwd: p.rootDir,
      exitCode: 0,
      stdout: result.logs,
      stderr: "",
      startedAt,
      finishedAt,
      status: "success",
      mock: false,
    };

    p.previewUrl = result.url;
    p.buildMock = false;
    saveProject(p);

    return {
      ok: true,
      output: [
        "[VERCEL REMOTE BUILD] Real npm install/build ran on Vercel infrastructure.",
        result.logs,
        `Preview URL: ${result.url}`,
      ].join("\n\n"),
      commands: [command],
      previewUrl: result.url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const finishedAt = new Date().toISOString();
    return {
      ok: false,
      output: `[VERCEL REMOTE BUILD FAILED]\n${msg}`,
      commands: [
        {
          command: "vercel deploy (remote build verification)",
          cwd: p.rootDir,
          exitCode: 1,
          stdout: "",
          stderr: msg,
          startedAt,
          finishedAt,
          status: "failed",
          mock: false,
        },
      ],
    };
  }
}
