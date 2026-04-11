import type {
  StatusApiResponse,
  ApiMonitorStatus,
  ApiDayStatus,
  ApiRecentCheck,
} from '../types.js';
import type { Config } from '../config/types.js';

type HourlyRow = {
  monitor_name: string;
  hour_timestamp: number;
  total_checks: number;
  successful_checks: number;
};

type CheckResultRow = {
  monitor_name: string;
  checked_at: number;
  status: string;
  response_time_ms: number | undefined;
};

type MonitorStateRow = {
  monitor_name: string;
  current_status: string;
  last_checked: number;
};

export async function getStatusApiData(
  database: D1Database,
  config?: Config
): Promise<StatusApiResponse> {
  const states = await database
    .prepare('SELECT monitor_name, current_status, last_checked FROM monitor_state WHERE 1=?')
    .bind(1)
    .all<MonitorStateRow>();

  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const hourlyData = await database
    .prepare(
      'SELECT monitor_name, hour_timestamp, total_checks, successful_checks FROM check_results_hourly WHERE hour_timestamp >= ?'
    )
    .bind(ninetyDaysAgo)
    .all<HourlyRow>();

  const hourlyByMonitor = new Map<string, HourlyRow[]>();
  for (const row of hourlyData.results ?? []) {
    const existing = hourlyByMonitor.get(row.monitor_name) ?? [];
    existing.push(row);
    hourlyByMonitor.set(row.monitor_name, existing);
  }

  const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const recentChecks = await database
    .prepare(
      'SELECT monitor_name, checked_at, status, response_time_ms FROM check_results WHERE checked_at >= ? ORDER BY monitor_name, checked_at'
    )
    .bind(twentyFourHoursAgo)
    .all<CheckResultRow>();

  const checksByMonitor = new Map<string, CheckResultRow[]>();
  for (const row of recentChecks.results ?? []) {
    const existing = checksByMonitor.get(row.monitor_name) ?? [];
    existing.push(row);
    checksByMonitor.set(row.monitor_name, existing);
  }

  const monitors: ApiMonitorStatus[] = (states.results ?? []).map(state => {
    const hourly = hourlyByMonitor.get(state.monitor_name) ?? [];
    const dailyHistory = computeDailyHistory(hourly);
    const uptimePercent = computeOverallUptime(hourly);

    const status: 'up' | 'down' | 'unknown' =
      state.current_status === 'up' || state.current_status === 'down'
        ? state.current_status
        : 'unknown';

    const rawChecks = checksByMonitor.get(state.monitor_name) ?? [];
    const apiRecentChecks: ApiRecentCheck[] = rawChecks.map(c => ({
      timestamp: c.checked_at,
      status: c.status === 'up' ? ('up' as const) : ('down' as const),
      responseTimeMs: c.response_time_ms ?? 0,
    }));

    return {
      name: state.monitor_name,
      status,
      lastChecked: state.last_checked ?? null,
      uptimePercent,
      dailyHistory,
      recentChecks: apiRecentChecks,
    };
  });

  const operational = monitors.filter(m => m.status === 'up').length;
  const down = monitors.filter(m => m.status === 'down').length;

  return {
    monitors,
    summary: {
      total: monitors.length,
      operational,
      down,
    },
    lastUpdated: Math.floor(Date.now() / 1000),
    title: config?.settings.title ?? 'Atalaya Uptime Monitor',
  };
}

function computeDailyHistory(hourly: HourlyRow[]): ApiDayStatus[] {
  const now = new Date();
  const days: ApiDayStatus[] = Array.from({ length: 90 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (89 - i));
    date.setHours(0, 0, 0, 0);
    const dayStart = Math.floor(date.getTime() / 1000);
    const dayEnd = dayStart + 24 * 60 * 60;

    const dayHours = hourly.filter(h => h.hour_timestamp >= dayStart && h.hour_timestamp < dayEnd);

    let uptimePercent: number | undefined;
    if (dayHours.length > 0) {
      const totalChecks = dayHours.reduce((sum, h) => sum + h.total_checks, 0);
      const successfulChecks = dayHours.reduce((sum, h) => sum + h.successful_checks, 0);
      uptimePercent = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : undefined;
    }

    return {
      date: date.toISOString().split('T')[0],
      uptimePercent,
    };
  });

  return days;
}

function computeOverallUptime(hourly: HourlyRow[]): number {
  if (hourly.length === 0) {
    return 100;
  }

  const totalChecks = hourly.reduce((sum, h) => sum + h.total_checks, 0);
  const successfulChecks = hourly.reduce((sum, h) => sum + h.successful_checks, 0);
  return totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;
}
