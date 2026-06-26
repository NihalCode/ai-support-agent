/** Client-safe labels for integrations and status — hides mock/dev wording in Client Mode. */

export function integrationLabel(
  name: "jira" | "github" | "pinecone" | "ctix",
  configured: boolean,
  developerMode: boolean
): string | null {
  if (!developerMode) {
    if (configured) return `${capitalize(name)} connected`;
    return "Not connected yet";
  }
  switch (name) {
    case "jira":
      return `Jira: ${configured ? "live" : "mock"}`;
    case "github":
      return `GitHub: ${configured ? "live" : "mock"}`;
    case "pinecone":
      return `RAG: ${configured ? "Pinecone" : "local"}`;
    case "ctix":
      return `CTIX: ${configured ? "live" : "mock"}`;
    default:
      return null;
  }
}

export function problemsStatus(count: number, developerMode: boolean): string {
  if (count > 0) return `${count} issue${count > 1 ? "s" : ""} need attention`;
  return developerMode ? "No problems" : "Everything looks ready.";
}

export function explorerRepoLabel(repo: string | null, developerMode: boolean): string {
  if (repo) return repo;
  return developerMode ? "GitHub (mock)" : "Code integration not connected";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
