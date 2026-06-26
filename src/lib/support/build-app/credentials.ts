import "server-only";

/** Per-request deploy credentials — never persisted; may override server env. */
export interface BuildAppCredentials {
  vercelToken?: string;
  vercelTeamId?: string;
  githubToken?: string;
  githubRepo?: string;
  githubBranch?: string;
}

export interface ResolvedBuildAppCredentials {
  vercelToken: string | null;
  vercelTeamId: string | null;
  githubToken: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
}

export function resolveBuildAppCredentials(req?: BuildAppCredentials): ResolvedBuildAppCredentials {
  return {
    vercelToken: req?.vercelToken?.trim() || process.env.VERCEL_TOKEN?.trim() || null,
    vercelTeamId: req?.vercelTeamId?.trim() || process.env.VERCEL_TEAM_ID?.trim() || null,
    githubToken: req?.githubToken?.trim() || process.env.GITHUB_TOKEN?.trim() || null,
    githubRepo: req?.githubRepo?.trim() || process.env.GITHUB_REPO?.trim() || null,
    githubBranch: req?.githubBranch?.trim() || null,
  };
}

export function hasVercelDeployCredentials(creds: ResolvedBuildAppCredentials): boolean {
  return Boolean(creds.vercelToken);
}

export function hasGitHubPushCredentials(creds: ResolvedBuildAppCredentials): boolean {
  return Boolean(creds.githubToken && creds.githubRepo);
}
