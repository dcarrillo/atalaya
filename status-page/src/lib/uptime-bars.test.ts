import { describe, it, expect } from 'vitest';
import { getBarColor, uptimeWindowLabels } from './uptime-bars.js';
import type { ApiDayStatus } from '@worker/types';

function day(date: string, uptimePercent: number | undefined): ApiDayStatus {
  return { date, uptimePercent };
}

describe('uptimeWindowLabels', () => {
  it('returns the full window labels when there is no data', () => {
    expect(uptimeWindowLabels([])).toEqual({ heading: '90-day uptime', start: '90d ago' });
    expect(uptimeWindowLabels([day('2024-03-17', undefined)])).toEqual({
      heading: '90-day uptime',
      start: '90d ago',
    });
  });

  it('returns the full window labels once the oldest bucket has data', () => {
    const history = [day('2024-03-17', 99.9), day('2024-03-18', undefined)];
    expect(uptimeWindowLabels(history)).toEqual({ heading: '90-day uptime', start: '90d ago' });
  });

  it('names the first day with data while history is shorter than the window', () => {
    const history = [
      day('2024-06-13', undefined),
      day('2024-06-14', undefined),
      day('2024-06-15', 100),
    ];
    expect(uptimeWindowLabels(history)).toEqual({
      heading: 'Uptime since 2024-06-15',
      start: '2024-06-15',
    });
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
