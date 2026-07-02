"use client";

import { Code2, FileSearch, MessageSquare, SearchCheck, Send, Sparkles, Terminal } from "lucide-react";
import { PromptSuggestionCard } from "./PromptSuggestionCard";

const PROMPTS = [
  {
    title: "Investigate an API issue",
    example: "The CTIX indicator search endpoint is returning 500s for a customer.",
    icon: SearchCheck,
    testId: "prompt-card-investigate-api",
  },
  {
    title: "Find an endpoint",
    example: "Which CSAP endpoint should I use to add tags?",
    icon: FileSearch,
    testId: "prompt-card-endpoint",
  },
  {
    title: "Generate API snippet",
    example: "Give me a curl and Python example for the CFTR enrichment endpoint.",
    icon: Code2,
    testId: "prompt-card-snippet",
  },
  {
    title: "Write CQL",
    example: "Find high-confidence malicious IP indicators from the last 7 days.",
    icon: Terminal,
    testId: "prompt-card-cql",
  },
  {
    title: "Explain a payload",
    example: "Explain this Orchestrate workflow payload.",
    icon: MessageSquare,
    testId: "prompt-card-payload",
  },
  {
    title: "Draft support response",
    example: "Write a customer-safe update for this API issue.",
    icon: Send,
    testId: "prompt-card-response",
  },
] as const;

export function WelcomeHero({ onSelectPrompt }: { onSelectPrompt: (text: string) => void }) {
  return (
    <section className="mx-auto max-w-[920px] pt-10" data-testid="chat-welcome-hero">
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
          <Sparkles className="h-3.5 w-3.5" />
          Enterprise AI support workspace
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Investigate issues and work with Cyware APIs.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Ask in plain English. The agent can investigate tickets, search internal knowledge, draft
          customer responses, generate CQL, explain API endpoints, and create developer handoffs.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2" data-testid="prompt-suggestion-grid">
        {PROMPTS.map((p) => (
          <PromptSuggestionCard
            key={p.title}
            title={p.title}
            example={p.example}
            icon={p.icon}
            testId={p.testId}
            onClick={() => onSelectPrompt(p.example)}
          />
        ))}
      </div>
    </section>
  );
}
