import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config/types.js';
import { processResults } from './processor.js';
import type { CheckResult, MonitorState } from './types.js';

describe('processResults', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers down webhook when threshold met', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [
        {
          type: 'webhook' as const,
          name: 'alert',
          url: 'https://example.com',
          method: 'POST',
          headers: {},
          bodyTemplate: '',
        },
      ],
      monitors: [
        {
          name: 'test',
          type: 'http',
          target: 'https://example.com',
          method: 'GET',
          expectedStatus: 200,
          headers: {},
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 2,
          alerts: ['alert'],
        },
      ],
    };

    const results: CheckResult[] = [
      {
        name: 'test',
        status: 'down',
        responseTimeMs: 0,
        error: 'timeout',
        attempts: 3,
      },
    ];

    const states: MonitorState[] = [
      {
        monitor_name: 'test',
        current_status: 'up',
        consecutive_failures: 1,
        last_status_change: 0,
        last_checked: 0,
      },
    ];

    const actions = processResults(results, states, config);

    expect(actions.stateUpdates).toHaveLength(1);
    expect(actions.stateUpdates[0].consecutiveFailures).toBe(2);
    expect(actions.alerts).toHaveLength(1);
    expect(actions.alerts[0].alertType).toBe('down');
  });

  it('triggers recovery webhook on up after down', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [
        {
          type: 'webhook' as const,
          name: 'alert',
          url: 'https://example.com',
          method: 'POST',
          headers: {},
          bodyTemplate: '',
        },
      ],
      monitors: [
        {
          name: 'test',
          type: 'http',
          target: 'https://example.com',
          method: 'GET',
          expectedStatus: 200,
          headers: {},
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 2,
          alerts: ['alert'],
        },
      ],
    };

    const results: CheckResult[] = [
      {
        name: 'test',
        status: 'up',
        responseTimeMs: 150,
        error: '',
        attempts: 1,
      },
    ];

    const states: MonitorState[] = [
      {
        monitor_name: 'test',
        current_status: 'down',
        consecutive_failures: 3,
        last_status_change: 0,
        last_checked: 0,
      },
    ];

    const actions = processResults(results, states, config);

    expect(actions.alerts).toHaveLength(1);
    expect(actions.alerts[0].alertType).toBe('recovery');
  });

  it('does not trigger webhook when below threshold', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 3,
      },
      alerts: [],
      monitors: [
        {
          name: 'test',
          type: 'http',
          target: 'https://example.com',
          method: 'GET',
          expectedStatus: 200,
          headers: {},
          timeoutMs: 5000,
          retries: 3,
          retryDelayMs: 1000,
          failureThreshold: 3,
          alerts: ['alert'],
        },
      ],
    };

    const results: CheckResult[] = [
      {
        name: 'test',
        status: 'down',
        responseTimeMs: 0,
        error: 'timeout',
        attempts: 3,
      },
    ];

    const states: MonitorState[] = [
      {
        monitor_name: 'test',
        current_status: 'up',
        consecutive_failures: 1,
        last_status_change: 0,
        last_checked: 0,
      },
    ];

    const actions = processResults(results, states, config);

    expect(actions.alerts).toHaveLength(0);
  });

  it('skips unknown monitors', () => {
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
          name: 'known',
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

    const results: CheckResult[] = [
      {
        name: 'unknown',
        status: 'down',
        responseTimeMs: 0,
        error: 'timeout',
        attempts: 1,
      },
    ];

    const actions = processResults(results, [], config);

    expect(actions.dbWrites).toHaveLength(0);
    expect(actions.stateUpdates).toHaveLength(0);
  });

  it('handles empty inputs', () => {
    const config: Config = {
      settings: {
        defaultRetries: 3,
        defaultRetryDelayMs: 1000,
        defaultTimeoutMs: 5000,
        defaultFailureThreshold: 2,
      },
      alerts: [],
      monitors: [],
    };

    const actions = processResults([], [], config);

    expect(actions.dbWrites).toHaveLength(0);
    expect(actions.stateUpdates).toHaveLength(0);
    expect(actions.alerts).toHaveLength(0);
  });

  it('creates default state for new monitors', () => {
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
          name: 'new-monitor',
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

    const results: CheckResult[] = [
      {
        name: 'new-monitor',
        status: 'up',
        responseTimeMs: 100,
        error: '',
        attempts: 1,
      },
    ];

    const actions = processResults(results, [], config);

    expect(actions.stateUpdates).toHaveLength(1);
    expect(actions.stateUpdates[0].currentStatus).toBe('up');
    expect(actions.stateUpdates[0].consecutiveFailures).toBe(0);
  });
});
