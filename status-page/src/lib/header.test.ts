import { describe, it, expect, afterAll } from 'vitest';
import { formatAbsoluteTime } from './header.js';

describe('formatAbsoluteTime', () => {
  const origTZ = process.env.TZ;

  afterAll(() => {
    process.env.TZ = origTZ;
  });

  it('formats timestamp in UTC', () => {
    process.env.TZ = 'UTC';
    // 1704067200 = 2024-01-01 00:00:00 UTC
    const result = formatAbsoluteTime(1704067200);
    expect(result).toContain('Jan');
    expect(result).toContain('1,');
    expect(result).toContain('00:00');
  });

  it('returns month abbreviation in English', () => {
    process.env.TZ = 'UTC';
    // 1719792000 = 2024-07-01 00:00:00 UTC
    const result = formatAbsoluteTime(1719792000);
    expect(result).toContain('Jul');
    expect(result).toContain('1,');
  });
});
