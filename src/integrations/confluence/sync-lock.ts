import "server-only";

let syncActive = false;

/** Returns false if a sync is already running. */
export function tryAcquireConfluenceSyncLock(): boolean {
  if (syncActive) return false;
  syncActive = true;
  return true;
}

export function releaseConfluenceSyncLock(): void {
  syncActive = false;
}

export function isConfluenceSyncInProgress(): boolean {
  return syncActive;
}

/** Run fn while holding the sync lock; always releases in finally. */
export async function withConfluenceSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    releaseConfluenceSyncLock();
  }
}
