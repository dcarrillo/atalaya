import { describe, it, expect } from 'vitest';
import { formatUptime } from './monitor-card.js';

describe('formatUptime', () => {
  it('returns a dash, not 100%, when there is no data', () => {
    expect(formatUptime(undefined)).toBe('—');
    expect(formatUptime(null as unknown as undefined)).toBe('—');
  });

  it('formats a percentage to two decimals', () => {
    expect(formatUptime(100)).toBe('100.00%');
    expect(formatUptime(99.456)).toBe('99.46%');
    expect(formatUptime(0)).toBe('0.00%');
  });
});
