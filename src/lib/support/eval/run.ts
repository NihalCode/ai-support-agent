import "server-only";

import type { IssueAnalysis } from "../types";
import { TEST_CASES, type SupportTestCase } from "./test-cases";
import { ingestRepo } from "../ingest";
import { analyzeIssue } from "../analyze";
import { ticketConnectorForRef } from "../connectors";
import { MOCK_REPO } from "../connectors/mock-data";

export interface TestCaseResult {
  id: string;
  name: string;
  description: string;
  pass: boolean;
  reasons: string[];
  analysis: IssueAnalysis;
}

/** Ensure the mock repo is ingested into the (memory or Pinecone) store. */
let ingestedOnce = false;
export async function ensureMockIngested(force = false): Promise<void> {
  if (ingestedOnce && !force) return;
  await ingestRepo({ includeIssues: true, includePRs: true });
  ingestedOnce = true;
}

function evaluate(tc: SupportTestCase, analysis: IssueAnalysis): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!tc.expect.categories.includes(analysis.category)) {
    reasons.push(
      `category ${analysis.category} not in expected [${tc.expect.categories.join(", ")}]`
    );
  }
  if (!tc.expect.fixabilities.includes(analysis.fixability)) {
    reasons.push(
      `fixability ${analysis.fixability} not in expected [${tc.expect.fixabilities.join(", ")}]`
    );
  }
  if (tc.expect.mustMention?.length) {
    const hay = [
      analysis.rootCause,
      analysis.summary,
      ...analysis.evidence,
      ...analysis.fixSteps,
      analysis.suggestedTicketResponse,
    ]
      .join(" ")
      .toLowerCase();
    for (const m of tc.expect.mustMention) {
      if (!hay.includes(m.toLowerCase())) reasons.push(`missing mention: "${m}"`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

export async function runTestCase(tc: SupportTestCase): Promise<TestCaseResult> {
  await ensureMockIngested();
  let issue = null;
  if (tc.issueRef) {
    const { connector } = await ticketConnectorForRef(tc.issueRef, MOCK_REPO);
    issue = await connector.getIssue(tc.issueRef);
  }
  const analysis = await analyzeIssue({
    ref: MOCK_REPO,
    description: tc.description,
    issue,
    evalMode: true,
  });
  const { pass, reasons } = evaluate(tc, analysis);
  return { id: tc.id, name: tc.name, description: tc.description, pass, reasons, analysis };
}

export async function runAllTestCases(): Promise<{
  total: number;
  passed: number;
  results: TestCaseResult[];
}> {
  await ensureMockIngested(true);
  const results: TestCaseResult[] = [];
  for (const tc of TEST_CASES) {
    results.push(await runTestCase(tc));
  }
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    results,
  };
}
