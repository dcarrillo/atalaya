import { describe, it, expect, vi } from 'vitest';
import { getStatusApiData } from './status.js';
import type { Config } from '../config/types.js';

function mockD1Database(results: { states: unknown[]; hourly: unknown[]; recent: unknown[] }) {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => {
          if (sql.includes('monitor_state')) {
            return { results: results.states };
          }

          if (sql.includes('check_results_hourly')) {
            return { results: results.hourly };
          }

          if (sql.includes('check_results')) {
            return { results: results.recent };
          }

          return { results: [] };
        }),
      })),
    })),
  } as unknown as D1Database;
}

const testConfig: Config = {
  settings: {
    title: 'Test Status Page',
    defaultRetries: 3,
    defaultRetryDelayMs: 1000,
    defaultTimeoutMs: 10000,
    defaultFailureThreshold: 3,
  },
  monitors: [],
  alerts: [],
};

describe('getStatusApiData', () => {
  it('returns empty monitors when DB has no data', async () => {
    const db = mockD1Database({ states: [], hourly: [], recent: [] });
    const result = await getStatusApiData(db, testConfig);

    expect(result.monitors).toEqual([]);
    expect(result.summary).toEqual({ total: 0, operational: 0, down: 0 });
    expect(typeof result.lastUpdated).toBe('number');
    expect(result.title).toBe('Test Status Page');
  });

  it('returns monitor with correct status and uptime', async () => {
    const now = Math.floor(Date.now() / 1000);
    const hourTimestamp = now - 3600;

    const db = mockD1Database({
      states: [{ monitor_name: 'test-monitor', current_status: 'up', last_checked: now }],
      hourly: [
        {
          monitor_name: 'test-monitor',
          hour_timestamp: hourTimestamp,
          total_checks: 60,
          successful_checks: 58,
        },
      ],
      recent: [
        {
          monitor_name: 'test-monitor',
          checked_at: now - 60,
          status: 'up',
          response_time_ms: 120,
        },
      ],
    });

    const result = await getStatusApiData(db, testConfig);

    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].name).toBe('test-monitor');
    expect(result.monitors[0].status).toBe('up');
    expect(result.monitors[0].lastChecked).toBe(now);
    expect(result.monitors[0].dailyHistory).toHaveLength(90);
    expect(result.monitors[0].recentChecks).toHaveLength(1);
    expect(result.monitors[0].recentChecks[0]).toEqual({
      timestamp: now - 60,
      status: 'up',
      responseTimeMs: 120,
    });
    expect(result.summary).toEqual({ total: 1, operational: 1, down: 0 });
    expect(result.title).toBe('Test Status Page');
  });

  it('computes summary counts correctly with mixed statuses', async () => {
    const now = Math.floor(Date.now() / 1000);
    const db = mockD1Database({
      states: [
        { monitor_name: 'up-monitor', current_status: 'up', last_checked: now },
        { monitor_name: 'down-monitor', current_status: 'down', last_checked: now },
        { monitor_name: 'another-up', current_status: 'up', last_checked: now },
      ],
      hourly: [],
      recent: [],
    });

    const result = await getStatusApiData(db, testConfig);

    expect(result.summary).toEqual({ total: 3, operational: 2, down: 1 });
    expect(result.title).toBe('Test Status Page');
  });

  it('surfaces maintenance status and excludes from up/down counts', async () => {
    const now = Math.floor(Date.now() / 1000);
    const db = mockD1Database({
      states: [
        { monitor_name: 'up-monitor', current_status: 'up', last_checked: now },
        { monitor_name: 'maint', current_status: 'maintenance', last_checked: now },
        { monitor_name: 'down-monitor', current_status: 'down', last_checked: now },
      ],
      hourly: [],
      recent: [
        {
          monitor_name: 'maint',
          checked_at: now - 10,
          status: 'maintenance',
          response_time_ms: 0,
        },
      ],
    });
    const result = await getStatusApiData(db, testConfig);
    const maint = result.monitors.find(m => m.name === 'maint');
    expect(maint).toBeDefined();
    expect(maint!.status).toBe('maintenance');
    expect(maint!.recentChecks[0]).toEqual({
      timestamp: now - 10,
      status: 'maintenance',
      responseTimeMs: 0,
    });
    // Only up and down counted in summary
    expect(result.summary).toEqual({ total: 3, operational: 1, down: 1 });
  });

  it('does not count unknown status monitors as down', async () => {
    const now = Math.floor(Date.now() / 1000);
    const db = mockD1Database({
      states: [
        { monitor_name: 'up-monitor', current_status: 'up', last_checked: now },
        { monitor_name: 'unknown-monitor', current_status: 'unknown', last_checked: now },
      ],
      hourly: [],
      recent: [],
    });

    const result = await getStatusApiData(db, testConfig);

    expect(result.summary).toEqual({ total: 2, operational: 1, down: 0 });
    expect(result.title).toBe('Test Status Page');
  });

  it('computes daily uptime percentage from hourly data', async () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

    const db = mockD1Database({
      states: [
        {
          monitor_name: 'test',
          current_status: 'up',
          last_checked: Math.floor(now.getTime() / 1000),
        },
      ],
      hourly: [
        {
          monitor_name: 'test',
          hour_timestamp: todayStartUnix,
          total_checks: 60,
          successful_checks: 57,
        },
        {
          monitor_name: 'test',
          hour_timestamp: todayStartUnix + 3600,
          total_checks: 60,
          successful_checks: 60,
        },
      ],
      recent: [],
    });

    const result = await getStatusApiData(db, testConfig);
    const today = result.monitors[0].dailyHistory.at(-1);

    expect(today).toBeDefined();
    expect(today!.uptimePercent).toBeCloseTo((117 / 120) * 100, 1);
    expect(result.title).toBe('Test Status Page');
  });

  it('uses default title when no config is provided', async () => {
    const db = mockD1Database({ states: [], hourly: [], recent: [] });
    const result = await getStatusApiData(db);

    expect(result.title).toBe('Atalaya Uptime Monitor');
  });

  it('uses default title when config has no settings', async () => {
    const db = mockD1Database({ states: [], hourly: [], recent: [] });
    const result = await getStatusApiData(db, { settings: {} } as Config);

    expect(result.title).toBe('Atalaya Uptime Monitor');
  });
});
