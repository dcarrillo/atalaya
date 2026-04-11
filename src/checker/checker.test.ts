import { describe, it, expect } from 'vitest';
import type { Config } from '../config/types.js';
import type { HttpCheckRequest } from '../types.js';
import { prepareChecks } from './checker.js';

describe('prepareChecks', () => {
  it('converts monitors to check requests', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [],
      monitors: [
        {
          name: 'test-http',
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

    const checks = prepareChecks(config);

    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe('test-http');
    expect(checks[0].type).toBe('http');
    expect(checks[0].target).toBe('https://example.com');
    const httpCheck = checks[0] as HttpCheckRequest;
    expect(httpCheck.method).toBe('GET');
    expect(httpCheck.expectedStatus).toBe(200);
    expect(checks[0].timeoutMs).toBe(5000);
  });

  it('returns empty array for empty monitors', () => {
    const config: Config = {
      settings: {
        defaultRetries: 0,
        defaultRetryDelayMs: 0,
        defaultTimeoutMs: 0,
        defaultFailureThreshold: 0,
      },
      alerts: [],
      monitors: [],
    };

    const checks = prepareChecks(config);
    expect(checks).toHaveLength(0);
  });

  it('omits empty optional fields', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [],
      monitors: [
        {
          name: 'test-tcp',
          type: 'tcp',
          target: 'example.com:443',
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 2,
          alerts: [],
        },
      ],
    };

    const checks = prepareChecks(config);

    expect('method' in checks[0]).toBe(false);
    expect('expectedStatus' in checks[0]).toBe(false);
  });

  it('passes headers through for HTTP monitors', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [],
      monitors: [
        {
          name: 'test-http-headers',
          type: 'http',
          target: 'https://example.com',
          method: 'GET',
          expectedStatus: 200,
          headers: { Authorization: 'Bearer token' },
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 2,
          alerts: [],
        },
      ],
    };

    const checks = prepareChecks(config);
    const httpCheck = checks[0] as HttpCheckRequest;

    expect(httpCheck.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('omits headers when empty', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [],
      monitors: [
        {
          name: 'test-http-no-headers',
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

    const checks = prepareChecks(config);
    const httpCheck = checks[0] as HttpCheckRequest;

    expect(httpCheck.headers).toBeUndefined();
  });
});
