import { NextResponse } from "next/server";
import { runAllTestCases, runTestCase } from "@/lib/support/eval/run";
import { TEST_CASES } from "@/lib/support/eval/test-cases";

export const runtime = "nodejs";
export const maxDuration = 120;

/** List the available test cases. */
export async function GET() {
  return NextResponse.json({
    cases: TEST_CASES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  });
}

/** Run one test case (by id) or all of them. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (body.id) {
      const tc = TEST_CASES.find((t) => t.id === body.id);
      if (!tc) return NextResponse.json({ error: `Unknown test case: ${body.id}` }, { status: 404 });
      const result = await runTestCase(tc);
      return NextResponse.json({ total: 1, passed: result.pass ? 1 : 0, results: [result] });
    }
    const summary = await runAllTestCases();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
