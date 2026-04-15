import type { Config } from '../config/types.js';
import type { CheckRequest } from './types.js';

export function prepareChecks(config: Config): CheckRequest[] {
  return config.monitors.map(m => {
    const base = {
      name: m.name,
      target: m.target,
      timeoutMs: m.timeoutMs,
      retries: m.retries,
      retryDelayMs: m.retryDelayMs,
      region: m.region,
    };

    switch (m.type) {
      case 'http': {
        return {
          ...base,
          type: m.type,
          method: m.method || undefined,
          expectedStatus: m.expectedStatus || undefined,
          expectedBodyContains: m.expectedBodyContains || undefined,
          headers: Object.keys(m.headers).length > 0 ? m.headers : undefined,
        };
      }

      case 'tcp': {
        return { ...base, type: m.type };
      }

      case 'dns': {
        return {
          ...base,
          type: m.type,
          recordType: m.recordType || undefined,
          expectedValues: m.expectedValues.length > 0 ? m.expectedValues : undefined,
        };
      }

      default: {
        const _exhaustive: never = m;
        throw new Error(`Unknown monitor type: ${String(_exhaustive)}`);
      }
    }
  });
}
