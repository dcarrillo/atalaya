import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAggregation } from './aggregation.js';
import type { Env } from './types.js';

type MockStmt = {
  bind: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
};

type MockDb = D1Database & {
  _mockStmt: MockStmt;
  _mockBind: ReturnType<typeof vi.fn>;
  _mockAll: ReturnType<typeof vi.fn>;
  _mockRun: ReturnType<typeof vi.fn>;
};

function createMockDatabase(): MockDb {
  const mockRun = vi.fn().mockResolvedValue({});
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockBind = vi.fn().mockReturnThis();

  const mockStmt = {
    bind: mockBind,
    run: mockRun,
    all: mockAll,
  };

  const mockPrepare = vi.fn().mockReturnValue(mockStmt);
  const mockBatch = vi.fn().mockResolvedValue([]);

  return {
    prepare: mockPrepare,
    batch: mockBatch,
    _mockStmt: mockStmt,
    _mockBind: mockBind,
    _mockAll: mockAll,
    _mockRun: mockRun,
  } as unknown as MockDb;
}

describe('handleAggregation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates data and deletes old records', async () => {
    const db = createMockDatabase();
    const env: Env = { DB: db, MONITORS_CONFIG: '' };

    await handleAggregation(env);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM check_results WHERE')
    );
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM check_results_hourly WHERE')
    );
  });

  it('inserts aggregated data when results exist', async () => {
    const db = createMockDatabase();
    const env: Env = { DB: db, MONITORS_CONFIG: '' };

    db._mockAll.mockResolvedValueOnce({
      results: [
        {
          monitor_name: 'test-monitor',
          total_checks: 60,
          successful_checks: 58,
          failed_checks: 2,
          avg_response_time_ms: 150.5,
          min_response_time_ms: 100,
          max_response_time_ms: 300,
        },
      ],
    });

    await handleAggregation(env);

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO check_results_hourly')
    );
    expect(db.batch).toHaveBeenCalled();
  });

  it('skips insert when no results to aggregate', async () => {
    const db = createMockDatabase();
    const env: Env = { DB: db, MONITORS_CONFIG: '' };

    db._mockAll.mockResolvedValueOnce({ results: [] });

    await handleAggregation(env);

    expect(db.batch).not.toHaveBeenCalled();
  });

  it('rounds average response time', async () => {
    const db = createMockDatabase();
    const env: Env = { DB: db, MONITORS_CONFIG: '' };

    db._mockAll.mockResolvedValueOnce({
      results: [
        {
          monitor_name: 'test',
          total_checks: 10,
          successful_checks: 10,
          failed_checks: 0,
          avg_response_time_ms: 123.456,
          min_response_time_ms: 100,
          max_response_time_ms: 150,
        },
      ],
    });

    await handleAggregation(env);

    expect(db._mockBind).toHaveBeenCalledWith('test', expect.any(Number), 10, 10, 0, 123, 100, 150);
  });

  it('handles null avg_response_time_ms', async () => {
    const db = createMockDatabase();
    const env: Env = { DB: db, MONITORS_CONFIG: '' };

    db._mockAll.mockResolvedValueOnce({
      results: [
        {
          monitor_name: 'test',
          total_checks: 10,
          successful_checks: 0,
          failed_checks: 10,
          avg_response_time_ms: undefined,
          min_response_time_ms: undefined,
          max_response_time_ms: undefined,
        },
      ],
    });

    await handleAggregation(env);

    expect(db._mockBind).toHaveBeenCalledWith(
      'test',
      expect.any(Number),
      10,
      0,
      10,
      0,
      undefined,
      undefined
    );
  });
});
