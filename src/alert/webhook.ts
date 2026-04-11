import type { Config, WebhookAlert } from '../config/types.js';
import { statusEmoji } from '../utils/status-emoji.js';
import type { TemplateData, WebhookPayload } from './types.js';

const templateRegex = /\{\{([^\}]+)\}\}/gv;

function jsonEscape(s: string): string {
  const escaped = JSON.stringify(s);
  return escaped.slice(1, -1);
}

function invertStatus(status: string): string {
  return status === 'down' ? 'up' : 'down';
}

function resolveKey(key: string, data: TemplateData): string {
  const trimmedKey = key.trim();

  const resolvers = new Map<string, () => string>([
    ['event', () => jsonEscape(data.event)],
    ['monitor.name', () => jsonEscape(data.monitor.name)],
    ['monitor.type', () => jsonEscape(data.monitor.type)],
    ['monitor.target', () => jsonEscape(data.monitor.target)],
    ['status.current', () => jsonEscape(data.status.current)],
    ['status.previous', () => jsonEscape(data.status.previous)],
    ['status.emoji', () => jsonEscape(statusEmoji(data.status.current))],
    ['status.consecutive_failures', () => String(data.status.consecutiveFailures)],
    ['status.last_status_change', () => jsonEscape(data.status.lastStatusChange)],
    ['status.downtime_duration_seconds', () => String(data.status.downtimeDurationSeconds)],
    ['check.timestamp', () => jsonEscape(data.check.timestamp)],
    ['check.response_time_ms', () => String(data.check.responseTimeMs)],
    ['check.attempts', () => String(data.check.attempts)],
    ['check.error', () => jsonEscape(data.check.error)],
  ]);

  const resolver = resolvers.get(trimmedKey);
  return resolver ? resolver() : '';
}

function renderTemplate(template: string, data: TemplateData): string {
  return template.replaceAll(templateRegex, (_match, key: string) => resolveKey(key, data));
}

export type FormatWebhookPayloadOptions = {
  alertName: string;
  monitorName: string;
  alertType: string;
  error: string;
  timestamp: number;
  config: Config;
};

export function formatWebhookPayload(options: FormatWebhookPayloadOptions): WebhookPayload {
  const { alertName, monitorName, alertType, error, timestamp, config } = options;

  const alert = config.alerts.find(a => a.name === alertName && a.type === 'webhook');
  if (!alert || alert.type !== 'webhook') {
    return {
      url: '',
      method: '',
      headers: {},
      body: '',
    };
  }
  const webhookAlert = alert as WebhookAlert;

  const monitor = config.monitors.find(m => m.name === monitorName);
  if (!monitor) {
    return {
      url: '',
      method: '',
      headers: {},
      body: '',
    };
  }

  const data: TemplateData = {
    event: `monitor.${alertType}`,
    monitor: {
      name: monitor.name,
      type: monitor.type,
      target: monitor.target,
    },
    status: {
      current: alertType,
      previous: invertStatus(alertType),
      consecutiveFailures: 0,
      lastStatusChange: '',
      downtimeDurationSeconds: 0,
    },
    check: {
      timestamp: new Date(timestamp * 1000).toISOString(),
      responseTimeMs: 0,
      attempts: 0,
      error,
    },
  };

  const body = renderTemplate(webhookAlert.bodyTemplate, data);

  return {
    url: webhookAlert.url,
    method: webhookAlert.method,
    headers: webhookAlert.headers,
    body,
  };
}
