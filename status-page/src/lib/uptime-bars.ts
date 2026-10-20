import type { ApiDayStatus } from '@worker/types';
import { UPTIME_WINDOW_DAYS } from '../../../src/constants.js';

export function getBarColor(uptimePercent: number | undefined): string {
  if (uptimePercent == null) return 'no-data';
  if (uptimePercent >= 99.8) return 'up';
  if (uptimePercent >= 95) return 'degraded';
  return 'down';
}

export interface UptimeWindowLabels {
  heading: string;
  start: string;
}

export function uptimeWindowLabels(dailyHistory: ApiDayStatus[]): UptimeWindowLabels {
  const fullHeading = `${UPTIME_WINDOW_DAYS}-day uptime`;
  const fullStart = `${UPTIME_WINDOW_DAYS}d ago`;

  const firstDataDay = dailyHistory.find(day => day.uptimePercent != null);
  if (firstDataDay === undefined || firstDataDay === dailyHistory[0]) {
    return { heading: fullHeading, start: fullStart };
  }

  return { heading: `Uptime since ${firstDataDay.date}`, start: firstDataDay.date };
}
