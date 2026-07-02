import "server-only";

import type { AgentResult, DeploymentFinding, SupportQuery } from "../investigation/types";
import { listDeployments, deploymentsToEvidence } from "../services/vercelService";

export async function runDeploymentAgent(q: SupportQuery): Promise<AgentResult<DeploymentFinding>> {
  const start = Date.now();
  const warnings: string[] = [];
  const { deployments, mock, note } = await listDeployments(5);
  const evidence = deploymentsToEvidence(deployments);

  const regressionSuspected =
    Boolean(q.timestamp || q.statusCode) &&
    deployments.length >= 1 &&
    (q.text.match(/after (the )?(latest|recent|new).*?(deploy|release)/i) !== null ||
      q.text.match(/started after.*(deploy|release|vercel)/i) !== null ||
      q.text.match(/since (this )?morning|started today/i) !== null ||
      q.text.match(/\bregression\b/i) !== null ||
      q.text.match(/since.*(deploy|release)/i) !== null);

  if (mock) warnings.push("Deployment history mock mode — set VERCEL_* env for live deploy data.");
  if (note) warnings.push(note);

  return {
    agent: "deployment",
    ok: true,
    mock,
    warnings,
    durationMs: Date.now() - start,
    data: {
      deployments: evidence,
      regressionSuspected,
      summary: regressionSuspected
        ? `Recent deployment ${deployments[0]?.id ?? ""} may correlate with the reported issue. Compare with ${deployments[1]?.id ?? "previous"}.`
        : deployments.length
          ? `Latest deployment: ${deployments[0]?.id} (${deployments[0]?.createdAt}).`
          : "No deployment history available.",
      mock,
    },
  };
}
