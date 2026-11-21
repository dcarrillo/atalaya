export function formatUptime(uptimePercent: number | undefined): string {
  if (uptimePercent == null) return '—';
  return `${formatUptimeNumber(uptimePercent)}%`;
}

export function formatUptimeNumber(uptimePercent: number): string {
  const rounded = uptimePercent.toFixed(2);
  // A value just under 100% (e.g. 99.998%) rounds up to "100.00" at two
  // decimals, hiding a tiny degradation. Keep it at 99.99% so the dip stays
  // visible instead of being swallowed by rounding.
  if (rounded === '100.00' && uptimePercent < 100) {
    return '99.99';
  }
  return rounded;
}
