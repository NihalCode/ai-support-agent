import { NextResponse } from "next/server";

const REMOVED_MESSAGE =
  "The app-building workflow has been removed from AI Support Agent. You can still ask about Cyware APIs, CQL, support issues, and developer handoffs in the main chat.";

/** @deprecated Build App feature removed — all actions return 410 Gone. */
export async function GET() {
  return NextResponse.json({ error: REMOVED_MESSAGE, removed: true }, { status: 410 });
}

/** @deprecated Build App feature removed — all actions return 410 Gone. */
export async function POST() {
  return NextResponse.json({ error: REMOVED_MESSAGE, removed: true }, { status: 410 });
}
