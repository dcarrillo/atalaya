import { describe, it, expect } from 'vitest';
import { parseConfig } from './config.js';

describe('parseConfig', () => {
  it('parses basic YAML config', () => {
    const yaml = `
settings:
  default_retries: 3
  default_retry_delay_ms: 1000
  default_timeout_ms: 5000
  default_failure_threshold: 2

alerts:
  - name: "test-webhook"
    type: webhook
    url: "https://example.com/hook"
    method: POST
    headers:
      Content-Type: "application/json"
    body_template: '{"msg": "{{monitor.name}}"}'

monitors:
  - name: "test-http"
    type: http
    target: "https://example.com"
    method: GET
    expected_status: 200
    alerts: ["test-webhook"]
`;
    const config = parseConfig(yaml);

    expect(config.settings.defaultRetries).toBe(3);
    expect(config.alerts).toHaveLength(1);
    expect(config.alerts[0].name).toBe('test-webhook');
    expect(config.monitors).toHaveLength(1);
    expect(config.monitors[0].name).toBe('test-http');
  });

  it('applies defaults to monitors', () => {
    const yaml = `
settings:
  default_retries: 5
  default_timeout_ms: 3000

monitors:
  - name: "minimal"
    type: http
    target: "https://example.com"
`;
    const config = parseConfig(yaml);

    expect(config.monitors[0].retries).toBe(5);
    expect(config.monitors[0].timeoutMs).toBe(3000);
  });

  it('interpolates environment variables', () => {
    const yaml = `
alerts:
  - name: "secure"
    type: webhook
    url: "https://example.com"
    method: POST
    headers:
      Authorization: "Bearer \${TEST_SECRET}"
    body_template: "test"
`;
    const config = parseConfig(yaml, { TEST_SECRET: 'my-secret-value' });

    expect(config.alerts[0].headers.Authorization).toBe('Bearer my-secret-value');
  });

  it('preserves unset env vars', () => {
    const yaml = `
alerts:
  - name: "test"
    type: webhook
    url: "https://example.com/\${UNDEFINED_VAR}/path"
    method: POST
    body_template: "test"
`;
    const config = parseConfig(yaml, {});

    expect(config.alerts[0].url).toBe('https://example.com/${UNDEFINED_VAR}/path');
  });

  it('defaults webhook method to POST', () => {
    const yaml = `
alerts:
  - name: "test"
    type: webhook
    url: "https://example.com"
    method: POST
    body_template: "test"
`;
    const config = parseConfig(yaml);

    expect(config.alerts[0].method).toBe('POST');
  });

  it('should interpolate BASIC_AUTH_SECRET from env', () => {
    const yaml = `
alerts:
  - name: "secure"
    type: webhook
    url: "https://example.com"
    method: POST
    headers:
      Authorization: "Basic \${BASIC_AUTH_SECRET}"
    body_template: "test"
`;
    const config = parseConfig(yaml, { BASIC_AUTH_SECRET: 'dXNlcjpwYXNz' });

    expect(config.alerts[0].headers.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  it('parses monitor headers', () => {
    const yaml = `
monitors:
  - name: "api-with-auth"
    type: http
    target: "https://api.example.com/health"
    headers:
      Authorization: "Bearer my-token"
      Accept: "application/json"
`;
    const config = parseConfig(yaml);

    expect(config.monitors[0].type).toBe('http');
    if (config.monitors[0].type === 'http') {
      expect(config.monitors[0].headers).toEqual({
        Authorization: 'Bearer my-token',
        Accept: 'application/json',
      });
    }
  });

  it('defaults monitor headers to empty object', () => {
    const yaml = `
monitors:
  - name: "no-headers"
    type: http
    target: "https://example.com"
`;
    const config = parseConfig(yaml);

    if (config.monitors[0].type === 'http') {
      expect(config.monitors[0].headers).toEqual({});
    }
  });

  it('interpolates env vars in monitor headers', () => {
    const yaml = `
monitors:
  - name: "secure-api"
    type: http
    target: "https://api.example.com"
    headers:
      Authorization: "Bearer \${API_TOKEN}"
`;
    const config = parseConfig(yaml, { API_TOKEN: 'secret-token' });

    if (config.monitors[0].type === 'http') {
      expect(config.monitors[0].headers.Authorization).toBe('Bearer secret-token');
    }
  });

  it('parses alerts array with webhook type', () => {
    const yaml = `
alerts:
  - name: test-webhook
    type: webhook
    url: https://example.com
    method: POST
    headers: {}
    body_template: 'test'
monitors:
  - name: test
    type: http
    target: https://example.com
    alerts: [test-webhook]
`;
    const config = parseConfig(yaml);
    expect(config.alerts).toHaveLength(1);
    expect(config.alerts[0].type).toBe('webhook');
  });

  it('parses title from settings', () => {
    const yaml = `
settings:
  title: "My Custom Status Page"
  default_retries: 3
  default_retry_delay_ms: 1000
  default_timeout_ms: 5000
  default_failure_threshold: 2

monitors:
  - name: "test-http"
    type: http
    target: "https://example.com"
`;
    const config = parseConfig(yaml);

    expect(config.settings.title).toBe('My Custom Status Page');
  });

  it('makes title optional', () => {
    const yaml = `
settings:
  default_retries: 3
  default_retry_delay_ms: 1000
  default_timeout_ms: 5000
  default_failure_threshold: 2

monitors:
  - name: "test-http"
    type: http
    target: "https://example.com"
`;
    const config = parseConfig(yaml);

    expect(config.settings.title).toBe('Atalaya Uptime Monitor');
  });

  it('handles empty settings with default title', () => {
    const yaml = 'monitors: []';
    const config = parseConfig(yaml);
    expect(config.settings.title).toBe('Atalaya Uptime Monitor');
  });

  it('parses expected_body_contains field', () => {
    const yaml = `
monitors:
  - name: "api-health"
    type: http
    target: "https://api.example.com/health"
    expected_body_contains: "healthy"
`;
    const config = parseConfig(yaml);

    expect(config.monitors).toHaveLength(1);
    if (config.monitors[0].type === 'http') {
      expect(config.monitors[0].expectedBodyContains).toBe('healthy');
    }
  });

  it('defaults expected_body_contains to empty string', () => {
    const yaml = `
monitors:
  - name: "no-body-check"
    type: http
    target: "https://example.com"
`;
    const config = parseConfig(yaml);

    expect(config.monitors).toHaveLength(1);
    if (config.monitors[0].type === 'http') {
      expect(config.monitors[0].expectedBodyContains).toBe('');
    }
  });

  it('parses incident timeline entries', () => {
    const yaml = `
incidents:
  - time: "2026-11-14T10:30:00Z"
    description: "Elevated latency on the API gateway."
  - time: "2026-11-13T08:00:00Z"
    description: "Scheduled database maintenance."
`;
    const config = parseConfig(yaml);

    expect(config.incidents).toHaveLength(2);
    expect(config.incidents[0].time).toBe('2026-11-14T10:30:00Z');
    expect(config.incidents[0].description).toBe('Elevated latency on the API gateway.');
    expect(config.incidents[1].description).toBe('Scheduled database maintenance.');
  });

  it('sorts incidents newest first', () => {
    const yaml = `
incidents:
  - time: "2026-11-12T08:00:00Z"
    description: "Older incident."
  - time: "2026-11-14T10:30:00Z"
    description: "Newer incident."
`;
    const config = parseConfig(yaml);

    expect(config.incidents[0].description).toBe('Newer incident.');
    expect(config.incidents[1].description).toBe('Older incident.');
  });

  it('drops invalid incident entries', () => {
    const yaml = `
incidents:
  - time: "2026-11-14T10:30:00Z"
    description: "Valid."
  - time: "not-a-time"
    description: "Invalid time."
  - time: "2026-11-13T08:00:00"
    description: "Missing Z."
  - time: "2026-11-12T08:00:00Z"
    description: ""
`;
    const config = parseConfig(yaml);

    expect(config.incidents).toHaveLength(1);
    expect(config.incidents[0].description).toBe('Valid.');
  });

  it('defaults incidents to empty array', () => {
    const config = parseConfig('monitors: []');
    expect(config.incidents).toEqual([]);
  });
});
