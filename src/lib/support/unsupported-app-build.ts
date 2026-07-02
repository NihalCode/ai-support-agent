/** Graceful response when users request app building (feature removed). */

export const UNSUPPORTED_APP_BUILD_MESSAGE = `This support agent no longer builds full applications. I can still help you design the workflow, identify Cyware endpoints, generate request snippets, write CQL, and prepare a developer handoff for implementation.

I can help with:
1. **API endpoint plan** — CSAP, CFTR, CTIX, or Orchestrate endpoints and parameters
2. **CQL query** — generation, explanation, or troubleshooting
3. **curl / Python / JavaScript snippets** — safe request examples
4. **UI requirements document** — what the implementation should include
5. **Developer handoff** — engineering summary with evidence and reproduction steps

What would you like to work on?`;

export function isAppBuildIntent(primaryIntent: string): boolean {
  return [
    "build_app",
    "edit_app",
    "explain_app",
    "preview_app",
    "deploy_app",
    "unsupported_app_build_request",
  ].includes(primaryIntent);
}
