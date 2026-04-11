import { describe, it, expect } from 'vitest';
import type { Config } from '../config/types.js';
import { formatWebhookPayload } from './webhook.js';

describe('formatWebhookPayload', () => {
  const baseConfig: Config = {
    settings: {
      defaultRetries: 3,
      defaultRetryDelayMs: 1000,
      defaultTimeoutMs: 5000,
      defaultFailureThreshold: 2,
    },
    alerts: [
      {
        name: 'test',
        type: 'webhook' as const,
        url: 'https://example.com/hook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyTemplate:
          '{"monitor":"{{monitor.name}}","status":"{{status.current}}","error":"{{check.error}}"}',
      },
    ],
    monitors: [
      {
        name: 'api-health',
        type: 'http',
        target: 'https://api.example.com',
        method: 'GET',
        expectedStatus: 200,
        headers: {},
        timeoutMs: 5000,
        retries: 3,
        retryDelayMs: 1000,
        failureThreshold: 2,
        alerts: ['test'],
      },
    ],
  };

  it('renders template with correct values', () => {
    const payload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'api-health',
      alertType: 'down',
      error: 'Connection timeout',
      timestamp: 1_711_882_800,
      config: baseConfig,
    });

    expect(payload.url).toBe('https://example.com/hook');
    expect(payload.method).toBe('POST');
    expect(payload.headers['Content-Type']).toBe('application/json');
    expect(payload.body).toBe(
      '{"monitor":"api-health","status":"down","error":"Connection timeout"}'
    );
  });

  it('returns empty payload for missing webhook', () => {
    const payload = formatWebhookPayload({
      alertName: 'nonexistent',
      monitorName: 'api-health',
      alertType: 'down',
      error: '',
      timestamp: 0,
      config: baseConfig,
    });

    expect(payload.url).toBe('');
    expect(payload.body).toBe('');
  });

  it('returns empty payload for missing monitor', () => {
    const payload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'nonexistent',
      alertType: 'down',
      error: '',
      timestamp: 0,
      config: baseConfig,
    });

    expect(payload.url).toBe('');
    expect(payload.body).toBe('');
  });

  it('escapes special characters in JSON', () => {
    const config: Config = {
      ...baseConfig,
      alerts: [
        {
          name: 'test',
          type: 'webhook' as const,
          url: 'https://example.com',
          method: 'POST',
          headers: {},
          bodyTemplate: '{"name":"{{monitor.name}}"}',
        },
      ],
      monitors: [
        {
          name: 'test"with"quotes',
          type: 'http',
          target: 'https://example.com',
          method: 'GET',
          expectedStatus: 200,
          headers: {},
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 2,
          alerts: [],
        },
      ],
    };

    const payload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'test"with"quotes',
      alertType: 'down',
      error: '',
      timestamp: 0,
      config,
    });

    expect(payload.body).toBe(String.raw`{"name":"test\"with\"quotes"}`);
  });

  it('renders status.emoji template variable', () => {
    const config: Config = {
      ...baseConfig,
      alerts: [
        {
          name: 'test',
          type: 'webhook' as const,
          url: 'https://example.com',
          method: 'POST',
          headers: {},
          bodyTemplate: '{"text":"{{status.emoji}} {{monitor.name}} is {{status.current}}"}',
        },
      ],
    };

    const downPayload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'api-health',
      alertType: 'down',
      error: 'timeout',
      timestamp: 0,
      config,
    });
    expect(downPayload.body).toBe('{"text":"🔴 api-health is down"}');

    const recoveryPayload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'api-health',
      alertType: 'recovery',
      error: '',
      timestamp: 0,
      config,
    });
    expect(recoveryPayload.body).toBe('{"text":"🟢 api-health is recovery"}');
  });

  it('handles unknown template keys gracefully', () => {
    const config: Config = {
      ...baseConfig,
      alerts: [
        {
          name: 'test',
          type: 'webhook' as const,
          url: 'https://example.com',
          method: 'POST',
          headers: {},
          bodyTemplate: '{"unknown":"{{unknown.key}}"}',
        },
      ],
    };

    const payload = formatWebhookPayload({
      alertName: 'test',
      monitorName: 'api-health',
      alertType: 'down',
      error: '',
      timestamp: 0,
      config,
    });

    expect(payload.body).toBe('{"unknown":""}');
  });
});
