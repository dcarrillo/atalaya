const statusEmojiMap: Record<string, string> = {
  up: '🟢',
  down: '🔴',
  recovery: '🟢',
  unknown: '⚪',
};

export function statusEmoji(status: string): string {
  return statusEmojiMap[status] ?? '⚪';
}
