import type { Fixability, IssueCategory } from "../types";

/**
 * The 8 canonical support-agent test cases. Each describes a realistic client
 * complaint against the mock "acme/checkout-service" repo, plus the expected
 * triage classification. Used by the in-app Test Mode and by Vitest.
 */

export interface SupportTestCase {
  id: string;
  name: string;
  description: string;
  issueRef?: string;
  expect: {
    categories: IssueCategory[];
    fixabilities: Fixability[];
    /** Substrings expected somewhere in evidence/root cause (case-insensitive). */
    mustMention?: string[];
  };
}

export const TEST_CASES: SupportTestCase[] = [
  {
    id: "tc1-env-var",
    name: "Bug caused by wrong/missing environment variable",
    description:
      "The app crashes on startup with 'Missing STRIPE_SECRET_KEY. See README env table.'",
    expect: {
      categories: ["environment", "user-error"],
      fixabilities: ["client-can-fix"],
      mustMention: ["env", "stripe_secret_key"],
    },
  },
  {
    id: "tc2-missing-dep",
    name: "Bug caused by missing dependency",
    description:
      "Build fails: Module not found: Error: Can't resolve 'currency.js' in src/lib.",
    expect: {
      categories: ["known-bug", "environment"],
      fixabilities: ["support-can-fix", "client-can-fix"],
      mustMention: ["dependency", "module"],
    },
  },
  {
    id: "tc3-api-change",
    name: "Bug caused by an API change",
    description:
      "After upgrading, every call to /api/charge returns 404. It worked before the upgrade.",
    expect: {
      categories: ["known-bug"],
      fixabilities: ["client-can-fix", "support-can-fix"],
      mustMention: ["/v2"],
    },
  },
  {
    id: "tc4-already-fixed",
    name: "Issue already fixed in a previous PR",
    description:
      "Charge endpoint returns 404 after upgrade — same as before, seems unresolved.",
    issueRef: "gh#41",
    expect: {
      categories: ["known-bug"],
      fixabilities: ["client-can-fix", "support-can-fix"],
      mustMention: ["already", "fix"],
    },
  },
  {
    id: "tc5-duplicate",
    name: "Duplicate issue",
    description:
      "Cannot start app: Missing STRIPE_SECRET_KEY. See README env table.",
    expect: {
      categories: ["environment", "user-error"],
      fixabilities: ["client-can-fix"],
      mustMention: ["stripe_secret_key"],
    },
  },
  {
    id: "tc6-feature-request",
    name: "Unsupported feature request",
    description:
      "Please add support for PayPal payments in addition to Stripe. Is this on the roadmap?",
    expect: {
      categories: ["feature-request"],
      fixabilities: ["engineering-required", "not-doable"],
      mustMention: ["feature", "roadmap"],
    },
  },
  {
    id: "tc7-low-info",
    name: "Low-information customer complaint",
    description: "it broke",
    expect: {
      categories: ["unknown"],
      fixabilities: ["not-enough-info"],
      mustMention: ["more"],
    },
  },
  {
    id: "tc8-escalation",
    name: "Issue requiring engineering escalation",
    description:
      "Valid Stripe webhooks are intermittently rejected with 'Missing Stripe-Signature header' even though we send the header behind our proxy.",
    expect: {
      categories: ["new-bug", "known-bug"],
      fixabilities: ["engineering-required", "support-can-fix"],
      mustMention: ["webhook", "signature"],
    },
  },
];
