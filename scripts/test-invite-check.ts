/**
 * POST /api/auth/invite-check against APP_BASE_URL (or first CLI arg).
 * Usage: npm run auth:test-invite-check [email] [baseUrl]
 */
import { validateAuthConfigPublic } from "../src/lib/auth/auth-config-public";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim() || "test@example.com";
  const baseUrl =
    process.argv[3]?.trim() ||
    process.env.APP_BASE_URL?.trim();

  const secret = process.env.AUTH0_ACTION_SHARED_SECRET?.trim();

  console.log("AI Support Studio — invite-check probe\n");
  console.log(`  Email: ${email}`);
  console.log(`  Base URL: ${baseUrl ?? "(unset)"}`);

  const config = validateAuthConfigPublic();
  if (!secret) {
    console.error("\nAUTH0_ACTION_SHARED_SECRET is unset locally — cannot authenticate probe.");
    process.exit(1);
  }
  if (!baseUrl) {
    console.error("\nSet APP_BASE_URL or pass base URL as second argument.");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/auth/invite-check`;
  console.log(`  POST ${url}\n`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    console.error("Request failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  console.log(`HTTP ${response.status}`);
  console.log(`Content-Type: ${contentType}`);

  if (!contentType.includes("application/json")) {
    console.error("\nExpected JSON response — got non-JSON body (first 200 chars):");
    console.error(text.slice(0, 200));
    process.exit(1);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    console.error("\nInvalid JSON body:", text.slice(0, 200));
    process.exit(1);
  }

  console.log("\nResponse:");
  console.log(JSON.stringify(body, null, 2));

  if (config.issues.length > 0) {
    console.log("\nLocal config issues (may differ from deployment):");
    for (const issue of config.issues) {
      console.log(`  - ${issue}`);
    }
  }

  process.exit(response.ok || response.status === 401 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
