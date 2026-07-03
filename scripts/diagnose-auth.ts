/**
 * Safe auth configuration diagnostics — prints status only, never secret values.
 * Usage: npm run auth:diagnose
 */
import { validateAuthConfigPublic } from "../src/lib/auth/auth-config-public";

async function main(): Promise<void> {
  console.log("AI Support Studio — auth diagnostics\n");

  const config = validateAuthConfigPublic();

  console.log("Configuration checks:");
  for (const [key, value] of Object.entries(config.checks)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }

  if (config.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of config.issues) {
      console.log(`  - ${issue}`);
    }
  } else {
    console.log("\nNo configuration issues detected.");
  }

  console.log(
    `\nDatabase backend: ${config.checks.databaseConfigured ? "postgres" : "file (local or ephemeral on Vercel)"}`
  );
  console.log(
    "Active user count: run GET /api/admin/auth-diagnostics when signed in as admin for live DB state."
  );

  if (!config.checks.initialOwnerEmailSet && config.checks.vercelWithoutDatabase) {
    console.log(
      "\nWarning: no INITIAL_OWNER_EMAIL and no Postgres on Vercel — first owner cannot bootstrap."
    );
  }

  console.log(`\nOverall: ${config.ok ? "OK" : "NEEDS ATTENTION"}`);
  process.exit(config.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
