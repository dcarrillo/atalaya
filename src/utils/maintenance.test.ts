import { describe, it, expect } from 'vitest';
import { isInMaintenance, MaintenanceWindow } from './maintenance';

function utc(date: string) {
  // Shortcut for Date creation
  return new Date(date);
}

describe('isInMaintenance', () => {
  it('returns false when maintenance undefined or empty', () => {
    expect(isInMaintenance(undefined, utc('2026-05-01T10:00:00Z'))).toBe(false);
    expect(isInMaintenance([], utc('2026-05-01T10:00:00Z'))).toBe(false);
  });

  it('includes and excludes at precise boundaries', () => {
    const mw: MaintenanceWindow[] = [
      { start: '2026-05-01T10:00:00Z', end: '2026-05-01T12:00:00Z' },
    ];
    expect(isInMaintenance(mw, utc('2026-05-01T09:59:59Z'))).toBe(false);
    expect(isInMaintenance(mw, utc('2026-05-01T10:00:00Z'))).toBe(true); // start boundary, inclusive
    expect(isInMaintenance(mw, utc('2026-05-01T11:59:59Z'))).toBe(true);
    expect(isInMaintenance(mw, utc('2026-05-01T12:00:00Z'))).toBe(false); // end boundary, exclusive
  });

  it('handles overlapping windows', () => {
    const mw: MaintenanceWindow[] = [
      { start: '2026-05-01T10:00:00Z', end: '2026-05-01T11:00:00Z' },
      { start: '2026-05-01T10:30:00Z', end: '2026-05-01T11:30:00Z' },
    ];
    expect(isInMaintenance(mw, utc('2026-05-01T10:45:00Z'))).toBe(true);
    expect(isInMaintenance(mw, utc('2026-05-01T11:15:00Z'))).toBe(true);
    expect(isInMaintenance(mw, utc('2026-05-01T11:30:00Z'))).toBe(false);
  });

  it('ignores malformed windows (should not reach here)', () => {
    // A test for the future if parser passes bad data. Should stay false.
    const mw = [{ start: 'bad', end: 'also-bad' }] as any;
    expect(isInMaintenance(mw, utc('2026-05-01T10:00:00Z'))).toBe(false);
  });

  it('prefers the first valid match if multiple windows overlap', () => {
    const mw: MaintenanceWindow[] = [
      { start: '2026-05-01T08:00:00Z', end: '2026-05-01T11:00:00Z' },
      { start: '2026-05-01T10:00:00Z', end: '2026-05-01T12:00:00Z' },
    ];
    expect(isInMaintenance(mw, utc('2026-05-01T09:00:00Z'))).toBe(true);
    expect(isInMaintenance(mw, utc('2026-05-01T11:00:00Z'))).toBe(true);
    expect(isInMaintenance(mw, utc('2026-05-01T12:01:00Z'))).toBe(false);
  });
});
