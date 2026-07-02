import { handleBuildAppPlan } from "@/lib/support/build-app/orchestrate";

/** Thin wrapper so tests import orchestrate without duplicating agent entry. */
export function runAppBuilderAgentPath(req: {
  message: string;
  projectId?: string;
  buildOutput?: string;
}) {
  return handleBuildAppPlan(req);
}
