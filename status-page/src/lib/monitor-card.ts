export function formatLastChecked(timestamp: number | undefined): string {
  if (timestamp == null) return 'Never';
  const now = Math.floor(Date.now() / 1000);
  const diffSeconds = now - timestamp;

  if (diffSeconds < 60) return '';
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes}m ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffSeconds / 86400);
  return `${days}d ago`;
}
