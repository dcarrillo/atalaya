import yaml from 'js-yaml';
import { isValidRegion } from '../utils/region.js';
import type { Config, RawYamlConfig, Settings, Alert, Monitor } from './types.js';

const envVarRegex = /\$\{([^\}]+)\}/gv;

function interpolateEnv(content: string, envVars: Record<string, string | undefined> = {}): string {
  return content.replaceAll(envVarRegex, (match, varName: string) => {
    const value = envVars[varName];
    return value !== undefined && value !== '' ? value : match;
  });
}

function applyDefaults(raw: RawYamlConfig): Config {
  const settings: Settings = {
    defaultRetries: raw.settings?.default_retries ?? 0,
    defaultRetryDelayMs: raw.settings?.default_retry_delay_ms ?? 0,
    defaultTimeoutMs: raw.settings?.default_timeout_ms ?? 0,
    defaultFailureThreshold: raw.settings?.default_failure_threshold ?? 0,
    title: raw.settings?.title ?? 'Atalaya Uptime Monitor',
  };

  const alerts: Alert[] = [];
  if (raw.alerts) {
    for (const a of raw.alerts) {
      if (!a.name) {
        throw new Error(`Alert missing required field 'name': ${JSON.stringify(a)}`);
      }
      if (!a.type) {
        throw new Error(`Alert missing required fields: ${JSON.stringify(a)}`);
      }
      const type = a.type;
      if (type !== 'webhook') {
        throw new Error(`Unsupported alert type: ${type}`);
      }
      if (!a.url || !a.method || !a.body_template) {
        throw new Error(`Webhook alert missing required fields: ${a.name}`);
      }
      alerts.push({
        name: a.name,
        type: 'webhook',
        url: a.url,
        method: a.method ?? 'POST',
        headers: a.headers ?? {},
        bodyTemplate: a.body_template,
      });
    }
  }

  const monitors: Monitor[] = (raw.monitors ?? []).map(m => {
    // Validate region if provided
    if (m.region && !isValidRegion(m.region)) {
      console.warn(
        JSON.stringify({
          event: 'invalid_region',
          region: m.region,
          monitor: m.name,
        })
      );
    }

    const base = {
      name: m.name ?? '',
      target: m.target ?? '',
      timeoutMs: m.timeout_ms ?? settings.defaultTimeoutMs,
      retries: m.retries ?? settings.defaultRetries,
      retryDelayMs: m.retry_delay_ms ?? settings.defaultRetryDelayMs,
      failureThreshold: m.failure_threshold ?? settings.defaultFailureThreshold,
      alerts: m.alerts ?? [],
      region: m.region && isValidRegion(m.region) ? m.region : undefined,
    };

    const type = (m.type as 'http' | 'tcp' | 'dns') ?? 'http';

    switch (type) {
      case 'http': {
        return {
          ...base,
          type,
          method: m.method ?? '',
          expectedStatus: m.expected_status ?? 0,
          headers: m.headers ?? {},
        };
      }

      case 'tcp': {
        return { ...base, type };
      }

      case 'dns': {
        return {
          ...base,
          type,
          recordType: m.record_type ?? '',
          expectedValues: m.expected_values ?? [],
        };
      }

      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown monitor type: ${String(_exhaustive)}`);
      }
    }
  });

  return { settings, alerts, monitors };
}

export function parseConfig(yamlContent: string, env?: Record<string, string | undefined>): Config {
  const interpolated = interpolateEnv(yamlContent, env);
  const raw = yaml.load(interpolated) as RawYamlConfig;
  return applyDefaults(raw);
}
