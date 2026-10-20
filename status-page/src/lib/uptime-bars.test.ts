import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBarColor, uptimeWindowLabel } from './uptime-bars.js';

describe('uptimeWindowLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the full window label when there is no data', () => {
    expect(uptimeWindowLabel(undefined)).toBe('90-day uptime');
  });

  it('returns the full window label once data covers the window', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(uptimeWindowLabel(now - 90 * 86400)).toBe('90-day uptime');
    expect(uptimeWindowLabel(now - 89 * 86400)).toBe('90-day uptime');
  });

  it('names the first day with data while history is shorter than the window', () => {
    const since = Math.floor(new Date('2024-06-13T05:00:00Z').getTime() / 1000);
    expect(uptimeWindowLabel(since)).toBe('Uptime since 2024-06-13');
  });
});

describe('getBarColor', () => {
  it('returns "no-data" for null/undefined', () => {
    expect(getBarColor(undefined)).toBe('no-data');
    expect(getBarColor(null as unknown as undefined)).toBe('no-data');
  });

  it('returns "up" for >= 99.8', () => {
    expect(getBarColor(100)).toBe('up');
    expect(getBarColor(99.8)).toBe('up');
    expect(getBarColor(99.81)).toBe('up');
  });

  it('returns "degraded" for >= 95 and < 99.8', () => {
    expect(getBarColor(99.7)).toBe('degraded');
    expect(getBarColor(97.5)).toBe('degraded');
    expect(getBarColor(95)).toBe('degraded');
  });

  it('returns "down" for < 95', () => {
    expect(getBarColor(94.9)).toBe('down');
    expect(getBarColor(50)).toBe('down');
    expect(getBarColor(0)).toBe('down');
  });
});
