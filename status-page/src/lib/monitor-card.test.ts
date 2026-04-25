import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatLastChecked } from './monitor-card.js';

describe('formatLastChecked', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null/undefined', () => {
    expect(formatLastChecked(undefined)).toBe('Never');
    expect(formatLastChecked(null as unknown as undefined)).toBe('Never');
  });

  it('returns empty string for < 60 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatLastChecked(now - 30)).toBe('');
    expect(formatLastChecked(now - 0)).toBe('');
  });

  it('returns minutes ago', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatLastChecked(now - 120)).toBe('2m ago');
    expect(formatLastChecked(now - 3540)).toBe('59m ago');
  });

  it('returns hours ago', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatLastChecked(now - 3600)).toBe('1h ago');
    expect(formatLastChecked(now - 82800)).toBe('23h ago');
  });

  it('returns days ago', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatLastChecked(now - 86400)).toBe('1d ago');
    expect(formatLastChecked(now - 172800)).toBe('2d ago');
  });
});
