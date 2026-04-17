// Utility to determine if a monitor is in maintenance based on maintenance windows and current time
// All times must be strict ISO8601 with 'Z' (UTC). End is exclusive. Windows must be validated beforehand.

export interface MaintenanceWindow {
  start: string; // ISO8601 UTC
  end: string; // ISO8601 UTC
}

/**
 * Returns true if now is within any valid maintenance window.
 * start is inclusive, end is exclusive (UTC).
 * Malformed windows should have been filtered out by config parser.
 * Overlapping windows are fine.
 */
export function isInMaintenance(maintenance: MaintenanceWindow[] | undefined, now: Date): boolean {
  if (!maintenance || maintenance.length === 0) return false;
  const nowMs = now.getTime();
  for (const w of maintenance) {
    const startMs = Date.parse(w.start);
    const endMs = Date.parse(w.end);
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) continue; // skip malformed
    if (nowMs >= startMs && nowMs < endMs) {
      return true;
    }
  }
  return false;
}
