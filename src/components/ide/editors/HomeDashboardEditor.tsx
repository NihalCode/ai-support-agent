"use client";

import { productConfig } from "@/lib/product-config";
import { useWorkspace } from "../WorkspaceProvider";

const CARDS = [
  {
    id: "build",
    title: "Build an App",
    description:
      "Create a working app from a plain-English idea.",
    example: "Build an indicator search dashboard for analysts.",
    action: "build-app" as const,
    testId: "home-card-build",
    button: "Start building",
  },
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
    id: "deploy",
    title: "Prepare a Preview or Deployment",
    description: "Review readiness, generate a preview link, and deploy after approval.",
    example: "Can I share this with my team?",
    action: "deployments" as const,
    testId: "home-card-deploy",
    button: "Prepare preview",
  },
] as const;

export function HomeDashboardEditor() {
  const { runCommand, setActivity, addChatMessage, isClientMode } = useWorkspace();

  function startCard(action: (typeof CARDS)[number]["action"]) {
    switch (action) {
      case "build-app":
        runCommand("build-app");
        break;
      case "investigate":
        runCommand("investigate");
        break;
      case "api-registry":
        setActivity("api-registry");
        break;
      case "deployments":
        setActivity("deployments");
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
            <p className="home-card-example">
              <span className="home-card-example-label">Example:</span> &ldquo;{card.example}&rdquo;
            </p>
            <div className="home-card-actions">
              <button type="button" className="home-btn-primary" onClick={() => startCard(card.action)}>
                {card.button}
              </button>
              {isClientMode && (
                <button type="button" className="home-btn-ghost" onClick={() => tryExample(card.example)}>
                  Try example
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {isClientMode && (
        <section className="home-dashboard-hints" data-testid="home-chat-hints">
          <p className="home-hints-title">Try in the assistant:</p>
          <ul className="home-hints-list">
            <li>&ldquo;Build an indicator dashboard.&rdquo;</li>
            <li>&ldquo;The blocking workflow stopped working yesterday.&rdquo;</li>
            <li>&ldquo;Make this app client-ready.&rdquo;</li>
            <li>&ldquo;Create a preview link for my team.&rdquo;</li>
          </ul>
        </section>
      )}
    </div>
  );
}
