"use client";

import { Blocks, MessageSquare, SearchCheck, BookOpen, Send, Rocket, Sparkles } from "lucide-react";
import { PromptSuggestionCard } from "./PromptSuggestionCard";

const PROMPTS = [
  {
    title: "Build an app",
    example: "Create an indicator search dashboard for analysts.",
    icon: Blocks,
    testId: "prompt-card-build",
  },
  {
    title: "Investigate an issue",
    example: "The blocking workflow has been timing out since yesterday.",
    icon: SearchCheck,
    testId: "prompt-card-investigate",
  },
  {
    title: "Work with support tickets",
    example: "Summarize Zendesk ticket 1842 and check Jira for related bugs.",
    icon: MessageSquare,
    testId: "prompt-card-tickets",
  },
  {
    title: "Search internal knowledge",
    example: "Find the Confluence runbook for malicious IP blocking.",
    icon: BookOpen,
    testId: "prompt-card-knowledge",
  },
  {
    title: "Prepare customer response",
    example: "Draft a customer-safe update and developer handoff.",
    icon: Send,
    testId: "prompt-card-response",
  },
  {
    title: "Deploy or share",
    example: "Prepare a preview link I can share with my team.",
    icon: Rocket,
    testId: "prompt-card-deploy",
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
          Build, investigate, and resolve support issues with AI.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Ask in plain English. The agent can investigate tickets, search internal knowledge, draft
          customer responses, create developer handoffs, and build support tools.
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
