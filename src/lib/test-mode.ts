/** Deterministic test mode for E2E and CI — no real external credentials required. */

export function isTestMode(): boolean {
  return (
    process.env.TEST_MODE === "true" ||
    process.env.NEXT_PUBLIC_TEST_MODE === "true"
  );
}

export function isClientTestMode(): boolean {
  if (typeof window === "undefined") return isTestMode();
  return (
    process.env.NEXT_PUBLIC_TEST_MODE === "true" ||
    (window as unknown as { __TEST_MODE__?: boolean }).__TEST_MODE__ === true
  );
}
