export function getBarColor(uptimePercent: number | undefined): string {
  if (uptimePercent == null) return 'no-data';
  if (uptimePercent >= 99.8) return 'up';
  if (uptimePercent >= 95) return 'degraded';
  return 'down';
}
