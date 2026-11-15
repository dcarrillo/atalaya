export function formatUptime(uptimePercent: number | undefined): string {
  if (uptimePercent == null) return '—';
  return `${uptimePercent.toFixed(2)}%`;
}
