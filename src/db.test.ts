import { describe, it, expect, vi } from 'vitest';
import { getMonitorStates, writeCheckResults, updateMonitorStates, recordAlert } from './db.js';

function createMockDatabase() {
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

  type MockDb = D1Database & {
    _mockStmt: typeof mockStmt;
    _mockBind: typeof mockBind;
    _mockAll: typeof mockAll;
    _mockRun: typeof mockRun;
  };

  return {
    prepare: mockPrepare,
    batch: mockBatch,
    _mockStmt: mockStmt,
    _mockBind: mockBind,
    _mockAll: mockAll,
    _mockRun: mockRun,
  } as unknown as MockDb;
}

describe('getMonitorStates', () => {
  it('returns empty array when no states exist', async () => {
    const db = createMockDatabase();
    const result = await getMonitorStates(db);
    expect(result).toEqual([]);
  });

  it('returns monitor states from database', async () => {
    const db = createMockDatabase();
    const mockStates = [
      {
        monitor_name: 'test-monitor',
        current_status: 'up',
        consecutive_failures: 0,
        last_status_change: 1_700_000_000,
        last_checked: 1_700_001_000,
      },
    ];
    db._mockAll.mockResolvedValue({ results: mockStates });

    const result = await getMonitorStates(db);
    expect(result).toEqual(mockStates);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
  });
});

describe('writeCheckResults', () => {
  it('does nothing when writes array is empty', async () => {
    const db = createMockDatabase();
    await writeCheckResults(db, []);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('batches writes to database', async () => {
    const db = createMockDatabase();
    const writes = [
      {
        monitorName: 'test-monitor',
        checkedAt: 1_700_000_000,
        status: 'up',
        responseTimeMs: 150,
        errorMessage: '',
        attempts: 1,
      },
      {
        monitorName: 'test-monitor-2',
        checkedAt: 1_700_000_000,
        status: 'down',
        responseTimeMs: 5000,
        errorMessage: 'Timeout',
        attempts: 3,
      },
    ];

    await writeCheckResults(db, writes);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO check_results'));
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db._mockBind).toHaveBeenCalledTimes(2);
  });
});

describe('updateMonitorStates', () => {
  it('does nothing when updates array is empty', async () => {
    const db = createMockDatabase();
    await updateMonitorStates(db, []);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('batches state updates to database', async () => {
    const db = createMockDatabase();
    const updates = [
      {
        monitorName: 'test-monitor',
        currentStatus: 'down',
        consecutiveFailures: 3,
        lastStatusChange: 1_700_000_000,
        lastChecked: 1_700_001_000,
      },
    ];

    await updateMonitorStates(db, updates);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO monitor_state'));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'));
    expect(db.batch).toHaveBeenCalledTimes(1);
  });
});

describe('recordAlert', () => {
  it('inserts alert record', async () => {
    const db = createMockDatabase();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    await recordAlert(db, 'test-monitor', 'down', 'slack', true);

    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO alerts'));
    expect(db._mockBind).toHaveBeenCalledWith(
      'test-monitor',
      'down',
      expect.any(Number),
      'slack',
      1
    );
    expect(db._mockRun).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('records failure correctly', async () => {
    const db = createMockDatabase();
    await recordAlert(db, 'test-monitor', 'recovery', 'discord', false);

    expect(db._mockBind).toHaveBeenCalledWith(
      'test-monitor',
      'recovery',
      expect.any(Number),
      'discord',
      0
    );
  });
});
