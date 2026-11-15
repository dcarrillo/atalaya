import type { ApiDayStatus, ApiMonitorStatus, ApiRecentCheck } from '@worker/types';

export type MonitorStatus = ApiMonitorStatus['status'];
export type StatusTone = 'ok' | 'partial' | 'major' | 'maintenance' | 'unknown';

export interface StatusCounts {
  total: number;
  up: number;
  down: number;
  maintenance: number;
  unknown: number;
}

export interface Verdict {
  tone: StatusTone;
  label: string;
  detail: string;
}

export interface TraceStats {
  p50: number | null;
  p95: number | null;
  lastCheckAt: number | null;
  downSince: number | null;
  downSinceCapped: boolean;
  maintenanceSince: number | null;
  maintenanceSinceCapped: boolean;
  totalChecks: number;
}

export interface UptimeSummary {
  mean: number | undefined;
  daysWithData: number;
  noDataDays: number;
  below: ApiDayStatus[];
}

const STATUS_RANK: Record<MonitorStatus, number> = {
  down: 0,
  maintenance: 1,
  unknown: 2,
  up: 3,
};

export function statusRank(status: MonitorStatus): number {
  return STATUS_RANK[status] ?? STATUS_RANK.unknown;
}

export function sortMonitors<T extends Pick<ApiMonitorStatus, 'name' | 'status'>>(
  monitors: T[]
): T[] {
  return [...monitors].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name)
  );
}

export function countStatuses(monitors: Pick<ApiMonitorStatus, 'status'>[]): StatusCounts {
  const counts: StatusCounts = {
    total: monitors.length,
    up: 0,
    down: 0,
    maintenance: 0,
    unknown: 0,
  };
  for (const monitor of monitors) {
    if (monitor.status === 'up') counts.up++;
    else if (monitor.status === 'down') counts.down++;
    else if (monitor.status === 'maintenance') counts.maintenance++;
    else counts.unknown++;
  }
  return counts;
}

export function statusWord(status: MonitorStatus): string {
  switch (status) {
    case 'up':
      return 'Operational';
    case 'down':
      return 'Down';
    case 'maintenance':
      return 'Maintenance';
    default:
      return 'Unknown';
  }
}

function nameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function overallVerdict(monitors: Pick<ApiMonitorStatus, 'name' | 'status'>[]): Verdict {
  const counts = countStatuses(monitors);
  if (counts.total === 0) {
    return {
      tone: 'unknown',
      label: 'No services configured',
      detail: 'No monitors are configured.',
    };
  }

  if (counts.down === counts.total) {
    return {
      tone: 'major',
      label: 'Major outage',
      detail:
        counts.total === 1 ? 'The only service is down.' : `All ${counts.total} services are down.`,
    };
  }

  if (counts.down > 0) {
    const names = monitors.filter(m => m.status === 'down').map(m => m.name);
    return {
      tone: 'partial',
      label: counts.down === 1 ? 'Partial outage' : 'Multiple outages',
      detail: `${counts.down} of ${counts.total} services down · ${nameList(names)}`,
    };
  }

  if (counts.maintenance > 0) {
    const names = monitors.filter(m => m.status === 'maintenance').map(m => m.name);
    return {
      tone: 'maintenance',
      label: 'Scheduled maintenance',
      detail: `${counts.maintenance} of ${counts.total} services in maintenance · ${nameList(names)}`,
    };
  }

  if (counts.unknown > 0) {
    return {
      tone: 'unknown',
      label: 'Status unknown',
      detail: `${counts.unknown} of ${counts.total} services have no data.`,
    };
  }

  return {
    tone: 'ok',
    label: 'All systems operational',
    detail:
      counts.total === 1
        ? 'The service is operational.'
        : `All ${counts.total} services operational.`,
  };
}

function percentile(sorted: number[], value: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((value / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

interface TrailingRun {
  since: number;
  capped: boolean;
}

function trailingRun(checks: ApiRecentCheck[], status: string): TrailingRun | null {
  if (checks.length === 0) return null;
  const last = checks[checks.length - 1];
  if (last.status !== status) return null;

  let index = checks.length - 1;
  while (index > 0 && checks[index - 1].status === status) index--;
  return { since: checks[index].timestamp, capped: index === 0 };
}

export function computeTraceStats(checks: ApiRecentCheck[]): TraceStats {
  const ordered = [...checks].sort((a, b) => a.timestamp - b.timestamp);
  const successful = ordered.filter(check => check.status === 'up' && check.responseTimeMs > 0);
  const responses = successful.map(check => check.responseTimeMs).sort((a, b) => a - b);
  const down = trailingRun(ordered, 'down');
  const maintenance = trailingRun(ordered, 'maintenance');
  const lastCheck = ordered.at(-1);

  return {
    p50: percentile(responses, 50),
    p95: percentile(responses, 95),
    lastCheckAt: lastCheck?.timestamp ?? null,
    downSince: down?.since ?? null,
    downSinceCapped: down?.capped ?? false,
    maintenanceSince: maintenance?.since ?? null,
    maintenanceSinceCapped: maintenance?.capped ?? false,
    totalChecks: ordered.length,
  };
}

export function summarizeDailyHistory(days: ApiDayStatus[], threshold = 99.9): UptimeSummary {
  const values = days
    .map(day => day.uptimePercent)
    .filter((value): value is number => value != null);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    mean: values.length > 0 ? total / values.length : undefined,
    daysWithData: values.length,
    noDataDays: days.length - values.length,
    below: days.filter(day => day.uptimePercent != null && day.uptimePercent < threshold),
  };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole}s`;
  if (whole < 3600) return `${Math.floor(whole / 60)}m`;
  if (whole < 86_400) {
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    return minutes === 0 ? `${hours}h` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3600);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

const utcTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const utcShort = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

export function formatUtcTime(timestamp: number): string {
  return `${utcTime.format(new Date(timestamp * 1000))} UTC`;
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return utcShort.format(date);
}
