import type { MonitorState, DbWrite, StateUpdate } from './types.js';

const batchLimit = 100;

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}

export async function getMonitorStates(database: D1Database): Promise<MonitorState[]> {
  const result = await database
    .prepare(
      'SELECT monitor_name, current_status, consecutive_failures, last_status_change, last_checked FROM monitor_state WHERE 1=?'
    )
    .bind(1)
    .all<MonitorState>();

  return result.results || [];
}

export async function writeCheckResults(database: D1Database, writes: DbWrite[]): Promise<void> {
  if (writes.length === 0) {
    return;
  }

  const stmt = database.prepare(
    'INSERT INTO check_results (monitor_name, checked_at, status, response_time_ms, error_message, attempts) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const batch = writes.map(w =>
    stmt.bind(w.monitorName, w.checkedAt, w.status, w.responseTimeMs, w.errorMessage, w.attempts)
  );

  const chunks = chunkArray(batch, batchLimit);
  for (const chunk of chunks) {
    await database.batch(chunk);
  }
}

export async function updateMonitorStates(
  database: D1Database,
  updates: StateUpdate[]
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const stmt =
    database.prepare(`INSERT INTO monitor_state (monitor_name, current_status, consecutive_failures, last_status_change, last_checked)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(monitor_name) DO UPDATE SET
       current_status = excluded.current_status,
       consecutive_failures = excluded.consecutive_failures,
       last_status_change = excluded.last_status_change,
       last_checked = excluded.last_checked`);

  const batch = updates.map(u =>
    stmt.bind(
      u.monitorName,
      u.currentStatus,
      u.consecutiveFailures,
      u.lastStatusChange,
      u.lastChecked
    )
  );

  const chunks = chunkArray(batch, batchLimit);
  for (const chunk of chunks) {
    await database.batch(chunk);
  }
}

export async function recordAlert(
  database: D1Database,
  monitorName: string,
  alertType: string,
  alertName: string,
  success: boolean
): Promise<void> {
  await database
    .prepare(
      'INSERT INTO alerts (monitor_name, alert_type, sent_at, alert_name, success) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(monitorName, alertType, Math.floor(Date.now() / 1000), alertName, success ? 1 : 0)
    .run();
}
