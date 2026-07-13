import "server-only";

let syncActive = false;

export function tryAcquireZendeskSyncLock(): boolean {
  if (syncActive) return false;
  syncActive = true;
  return true;
}

export function releaseZendeskSyncLock(): void {
  syncActive = false;
}
