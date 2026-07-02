"use client";

import { productConfig } from "@/lib/product-config";
import { useWorkspace } from "../WorkspaceProvider";

const CARDS = [
  {
    id: "investigate",
    title: "Investigate an Issue",
    description:
      "Explain what is broken. The agent will infer the product, workflow, API, and missing details.",
    example: "The workflow that blocks malicious IPs stopped working yesterday.",
    action: "investigate" as const,
    testId: "home-card-investigate",
    button: "Start investigation",
  },
  {
    id: "apis",
    title: "Work with APIs and CQL",
    description: "Generate Cyware API calls, validate CQL, and create request examples.",
    example: "Find indicators from the last 7 days with confidence above 80.",
    action: "api-registry" as const,
    testId: "home-card-apis",
    button: "Explore APIs",
  },
  {
    id: "endpoint",
    title: "Find an Endpoint",
    description: "Look up CSAP, CFTR, CTIX, or Orchestrate endpoints and parameters.",
    example: "Which CSAP endpoint should I use to add tags?",
    action: "api-registry" as const,
    testId: "home-card-endpoint",
    button: "Search APIs",
  },
  {
    id: "cql",
    title: "Write or Explain CQL",
    description: "Generate, validate, or troubleshoot CQL queries for CTIX.",
    example: "Write a CQL query for high-confidence malicious IP indicators.",
    action: "cql" as const,
    testId: "home-card-cql",
    button: "Open CQL",
  },
] as const;

export function HomeDashboardEditor() {
  const { runCommand, setActivity, addChatMessage, isClientMode } = useWorkspace();

  function startCard(action: (typeof CARDS)[number]["action"]) {
    switch (action) {
      case "investigate":
        runCommand("investigate");
        break;
      case "api-registry":
        setActivity("api-registry");
        break;
      case "cql":
        setActivity("cql");
        break;
    }
  }

  function tryExample(example: string) {
    addChatMessage({ role: "user", content: example });
  }

  return (
    <div className="home-dashboard" data-testid="home-dashboard">
      <header className="home-dashboard-hero">
        <h1 className="home-dashboard-title">{productConfig.appName}</h1>
        <p className="home-dashboard-subtitle">{productConfig.tagline}</p>
      </header>

      <div className="home-dashboard-grid">
        {CARDS.map((card) => (
          <article key={card.id} className="home-card" data-testid={card.testId}>
            <h2 className="home-card-title">{card.title}</h2>
            <p className="home-card-desc">{card.description}</p>
            <p className="home-card-example">&ldquo;{card.example}&rdquo;</p>
            <div className="home-card-actions">
              <button type="button" className="home-card-btn" onClick={() => startCard(card.action)}>
                {card.button}
              </button>
              {!isClientMode && (
                <button type="button" className="home-card-link" onClick={() => tryExample(card.example)}>
                  Try example
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
