import type { HttpCheckRequest, CheckResult } from '../types.js';
import { sleep } from './utils.js';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'atalaya-uptime',
};

export async function executeHttpCheck(check: HttpCheckRequest): Promise<CheckResult> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError = '';
  const headers = { ...DEFAULT_HEADERS, ...check.headers };

  for (let i = 0; i <= check.retries; i++) {
    attempts++;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      timeout = setTimeout(() => {
        controller.abort();
      }, check.timeoutMs);

      const response = await fetch(check.target, {
        method: check.method ?? 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      timeout = undefined;

      const responseTime = Date.now() - startTime;

      if (check.expectedStatus && response.status !== check.expectedStatus) {
        lastError = `Expected status ${check.expectedStatus}, got ${response.status}`;
        if (i < check.retries) {
          await sleep(check.retryDelayMs);
          continue;
        }

        return {
          name: check.name,
          status: 'down',
          responseTimeMs: responseTime,
          error: lastError,
          attempts,
        };
      }

      return {
        name: check.name,
        status: 'up',
        responseTimeMs: responseTime,
        error: '',
        attempts,
      };
    } catch (error) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      lastError = error instanceof Error ? error.message : 'Unknown error';
      if (i < check.retries) {
        await sleep(check.retryDelayMs);
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return {
    name: check.name,
    status: 'down',
    responseTimeMs: Date.now() - startTime,
    error: lastError,
    attempts,
  };
}
