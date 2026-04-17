import type { Env } from './types.js';

const rawRetentionDays = 7;
const hourlyRetentionDays = 90;
const batchLimit = 100;

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}

type AggregationRow = {
  monitor_name: string;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  avg_response_time_ms: number | undefined;
  min_response_time_ms: number | undefined;
  max_response_time_ms: number | undefined;
};

export async function handleAggregation(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;
  const hourStart = Math.floor(oneHourAgo / 3600) * 3600;

  await aggregateHour(env.DB, hourStart);
  await deleteOldRawData(env.DB, now);
  await deleteOldHourlyData(env.DB, now);

  console.info(
    JSON.stringify({
      event: 'aggregation_complete',
      hour: new Date(hourStart * 1000).toISOString(),
    })
  );
}

async function aggregateHour(database: D1Database, hourStart: number): Promise<void> {
  const hourEnd = hourStart + 3600;

  const result = await database
    .prepare(
      `
      SELECT 
        monitor_name,
        COUNT(*) as total_checks,
        SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as successful_checks,
        SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) as failed_checks,
        AVG(response_time_ms) as avg_response_time_ms,
        MIN(response_time_ms) as min_response_time_ms,
        MAX(response_time_ms) as max_response_time_ms
      FROM check_results
      WHERE checked_at >= ? AND checked_at < ?
      GROUP BY monitor_name
    `
    )
    .bind(hourStart, hourEnd)
    .all<AggregationRow>();

  if (!result.results || result.results.length === 0) {
    return;
  }

  const stmt = database.prepare(`
    INSERT INTO check_results_hourly 
      (monitor_name, hour_timestamp, total_checks, successful_checks, failed_checks, avg_response_time_ms, min_response_time_ms, max_response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(monitor_name, hour_timestamp) DO UPDATE SET
      total_checks = excluded.total_checks,
      successful_checks = excluded.successful_checks,
      failed_checks = excluded.failed_checks,
      avg_response_time_ms = excluded.avg_response_time_ms,
      min_response_time_ms = excluded.min_response_time_ms,
      max_response_time_ms = excluded.max_response_time_ms
  `);

  const batch = result.results.map((row: AggregationRow) =>
    stmt.bind(
      row.monitor_name,
      hourStart,
      row.total_checks,
      row.successful_checks,
      row.failed_checks,
      Math.round(row.avg_response_time_ms ?? 0),
      row.min_response_time_ms,
      row.max_response_time_ms
    )
  );

  const chunks = chunkArray(batch, batchLimit);
  for (const chunk of chunks) {
    await database.batch(chunk);
  }
}

async function deleteOldRawData(database: D1Database, now: number): Promise<void> {
  const cutoff = now - rawRetentionDays * 24 * 3600;
  await database.prepare('DELETE FROM check_results WHERE checked_at < ?').bind(cutoff).run();
}

async function deleteOldHourlyData(database: D1Database, now: number): Promise<void> {
  const cutoff = now - hourlyRetentionDays * 24 * 3600;
  await database
    .prepare('DELETE FROM check_results_hourly WHERE hour_timestamp < ?')
    .bind(cutoff)
    .run();
}
