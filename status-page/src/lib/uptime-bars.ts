export function getBarColor(uptimePercent: number | undefined): string {
  if (uptimePercent == null) return 'no-data';
  if (uptimePercent >= 99.8) return 'up';
  if (uptimePercent >= 95) return 'degraded';
  return 'down';
}

const FULL_WINDOW_DAYS = 89;

export function uptimeWindowLabel(dataSince: number | undefined): string {
  if (dataSince == null) return '90-day uptime';
  const now = Math.floor(Date.now() / 1000);
  if (now - dataSince >= FULL_WINDOW_DAYS * 86400) return '90-day uptime';
  const date = new Date(dataSince * 1000).toISOString().split('T')[0];
  return `Uptime since ${date}`;
}
