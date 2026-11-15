import { describe, expect, it } from 'vitest';
import type { ApiDayStatus, ApiMonitorStatus, ApiRecentCheck } from '@worker/types';
import {
  computeTraceStats,
  countStatuses,
  formatDuration,
  formatShortDate,
  formatUtcTime,
  overallVerdict,
  sortMonitors,
  statusRank,
  statusWord,
  summarizeDailyHistory,
} from './status.js';

function check(
  timestamp: number,
  status: ApiRecentCheck['status'],
  responseTimeMs = 100
): ApiRecentCheck {
  return { timestamp, status, responseTimeMs };
}

function monitor(name: string, status: ApiMonitorStatus['status']): ApiMonitorStatus {
  return {
    name,
    status,
    lastChecked: 1_700_000_000,
    uptimePercent: 99.9,
    dataSince: 1_699_000_000,
    dailyHistory: [],
    recentChecks: [],
  };
}

function day(date: string, uptimePercent: number | undefined): ApiDayStatus {
  return { date, uptimePercent };
}

describe('computeTraceStats', () => {
  it('computes percentiles from successful checks only', () => {
    const stats = computeTraceStats([
      check(100, 'up', 100),
      check(200, 'up', 200),
      check(300, 'up', 300),
      check(400, 'down', 5000),
      check(500, 'down', 5000),
    ]);

    expect(stats.p50).toBe(200);
    expect(stats.p95).toBe(300);
    expect(stats.totalChecks).toBe(5);
    expect(stats.downSince).toBe(400);
    expect(stats.downSinceCapped).toBe(false);
  });

  it('flags a down run that reaches the start of the window', () => {
    const stats = computeTraceStats([check(100, 'down'), check(200, 'down')]);
    expect(stats.downSince).toBe(100);
    expect(stats.downSinceCapped).toBe(true);
    expect(stats.p50).toBeNull();
  });

  it('returns nulls for an empty window', () => {
    const stats = computeTraceStats([]);
    expect(stats).toMatchObject({
      p50: null,
      p95: null,
      lastCheckAt: null,
      downSince: null,
      maintenanceSince: null,
    });
  });

  it('tracks a current maintenance run', () => {
    const stats = computeTraceStats([check(100, 'up'), check(200, 'maintenance')]);
    expect(stats.maintenanceSince).toBe(200);
    expect(stats.maintenanceSinceCapped).toBe(false);
  });

  it('sorts checks before evaluating the trailing run', () => {
    const stats = computeTraceStats([check(300, 'down'), check(100, 'up'), check(200, 'up')]);
    expect(stats.downSince).toBe(300);
  });
});

describe('overallVerdict', () => {
  it('reports a healthy page', () => {
    const verdict = overallVerdict([monitor('API', 'up'), monitor('DNS', 'up')]);
    expect(verdict.tone).toBe('ok');
    expect(verdict.label).toBe('All systems operational');
    expect(verdict.detail).toBe('All 2 services operational.');
  });

  it('names a partial outage', () => {
    const verdict = overallVerdict([monitor('API', 'down'), monitor('DNS', 'up')]);
    expect(verdict.tone).toBe('partial');
    expect(verdict.label).toBe('Partial outage');
    expect(verdict.detail).toBe('1 of 2 services down · API');
  });

  it('reports a major outage when everything is down', () => {
    const verdict = overallVerdict([monitor('API', 'down'), monitor('DNS', 'down')]);
    expect(verdict.tone).toBe('major');
    expect(verdict.label).toBe('Major outage');
  });

  it('reports maintenance when nothing is down', () => {
    const verdict = overallVerdict([monitor('API', 'maintenance'), monitor('DNS', 'up')]);
    expect(verdict.tone).toBe('maintenance');
    expect(verdict.detail).toContain('API');
  });

  it('reports unknown when data is missing', () => {
    const verdict = overallVerdict([monitor('API', 'unknown'), monitor('DNS', 'up')]);
    expect(verdict.tone).toBe('unknown');
    expect(verdict.label).toBe('Status unknown');
  });

  it('handles an empty status page', () => {
    expect(overallVerdict([]).label).toBe('No services configured');
    expect(overallVerdict([]).detail).toBe('No monitors are configured.');
  });
});

describe('sorting and counts', () => {
  it('puts down services first and up services last', () => {
    const sorted = sortMonitors([
      monitor('Zulu', 'up'),
      monitor('Alpha', 'down'),
      monitor('Bravo', 'maintenance'),
      monitor('Charlie', 'unknown'),
    ]);
    expect(sorted.map(m => m.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Zulu']);
  });

  it('counts every state', () => {
    expect(
      countStatuses([
        monitor('a', 'up'),
        monitor('b', 'up'),
        monitor('c', 'down'),
        monitor('d', 'maintenance'),
        monitor('e', 'unknown'),
      ])
    ).toEqual({ total: 5, up: 2, down: 1, maintenance: 1, unknown: 1 });
  });

  it('orders statuses by urgency', () => {
    expect(statusRank('down')).toBeLessThan(statusRank('maintenance'));
    expect(statusRank('maintenance')).toBeLessThan(statusRank('unknown'));
    expect(statusRank('unknown')).toBeLessThan(statusRank('up'));
  });

  it('labels every state in words', () => {
    expect(statusWord('up')).toBe('Operational');
    expect(statusWord('down')).toBe('Down');
    expect(statusWord('maintenance')).toBe('Maintenance');
    expect(statusWord('unknown')).toBe('Unknown');
  });
});

describe('summarizeDailyHistory', () => {
  it('summarizes the mean and lists days below the threshold', () => {
    const summary = summarizeDailyHistory([
      day('2026-11-11', 100),
      day('2026-11-12', 99.5),
      day('2026-11-13', undefined),
      day('2026-11-14', 98.2),
    ]);

    expect(summary.mean).toBeCloseTo(99.2333, 3);
    expect(summary.daysWithData).toBe(3);
    expect(summary.noDataDays).toBe(1);
    expect(summary.below.map(d => d.date)).toEqual(['2026-11-12', '2026-11-14']);
  });
});

describe('formatting', () => {
  it('formats durations from seconds to days', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(18 * 60)).toBe('18m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3600 + 4 * 60)).toBe('1h 04m');
    expect(formatDuration(86_400)).toBe('1d');
    expect(formatDuration(2 * 86_400 + 3 * 3600)).toBe('2d 3h');
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats UTC times and dates', () => {
    const timestamp = Date.UTC(2026, 10, 15, 11, 19) / 1000;
    expect(formatUtcTime(timestamp)).toBe('11:19 UTC');
    expect(formatShortDate('2026-11-15')).toBe('15 Nov');
  });
});
