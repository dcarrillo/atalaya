import { describe, it, expect } from 'vitest';
import { getBarColor } from './uptime-bars.js';

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
