import { describe, it, expect } from 'vitest';
import { formatIncidentTime } from './header.js';

describe('formatIncidentTime', () => {
  it('formats an ISO 8601 UTC timestamp in UTC', () => {
    const result = formatIncidentTime('2026-11-14T10:30:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('Nov');
    expect(result).toContain('10:30');
    expect(result).toContain('UTC');
  });
});
