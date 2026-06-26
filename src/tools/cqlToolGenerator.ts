export interface GeneratedCqlTool {
  name: string;
  description: string;
  parameters: {
    query: { type: "string"; description: string; required: true };
    object_type?: { type: "string"; description: string };
  };
  examples: string[];
}

const CQL_EXAMPLES = [
  'type = "indicator" AND confidence_score > 80',
  'type = "indicator" AND ip LIKE "192.168.%"',
  'type = "indicator" AND tags IN ("malicious", "blocked")',
  'type = "indicator" AND created >= NOW(-7d)',
];

/** Tool definitions for CQL generation and validation agents. */
export function generateCqlTools(): GeneratedCqlTool[] {
  return [
    {
      name: "cql_generate",
      description: "Generate a Cyware Query Language (CQL) filter from natural language intent.",
      parameters: {
        query: { type: "string", description: "Natural language description of the filter needed", required: true },
        object_type: { type: "string", description: 'STIX object type, usually "indicator"' },
      },
      examples: CQL_EXAMPLES,
    },
    {
      name: "cql_validate",
      description: "Validate CQL syntax and explain errors.",
      parameters: {
        query: { type: "string", description: "CQL query string to validate", required: true },
      },
      examples: CQL_EXAMPLES,
    },
  ];
}

export function cqlExamplesForIntent(intent: string): string[] {
  const lower = intent.toLowerCase();
  if (/tag|label/i.test(lower)) return CQL_EXAMPLES.filter((e) => /tag/i.test(e));
  if (/ip|address/i.test(lower)) return CQL_EXAMPLES.filter((e) => /ip/i.test(e));
  if (/confidence|score/i.test(lower)) return CQL_EXAMPLES.filter((e) => /confidence/i.test(e));
  return CQL_EXAMPLES.slice(0, 2);
}
