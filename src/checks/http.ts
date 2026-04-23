import type { HttpCheckRequest, CheckResult } from '../types.js';
import { isBlockedURL } from '../utils/ssrf.js';
import { sleep } from './utils.js';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'atalaya-uptime',
};

export async function executeHttpCheck(check: HttpCheckRequest): Promise<CheckResult> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError = '';
  const headers = { ...DEFAULT_HEADERS, ...check.headers };

  const blockedReason = isBlockedURL(check.target);
  if (blockedReason) {
    return {
      name: check.name,
      status: 'down',
      responseTimeMs: 0,
      error: blockedReason,
      attempts: 0,
    };
  }

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
      const bodyText = await response.text();

      let statusOk = true;
      let bodyOk = true;
      let errorMessages: string[] = [];

      if (check.expectedStatus && check.expectedStatus > 0) {
        if (response.status !== check.expectedStatus) {
          statusOk = false;
          errorMessages.push(`Expected status ${check.expectedStatus}, got ${response.status}`);
        }
      } else if (response.status < 200 || response.status >= 400) {
        statusOk = false;
        errorMessages.push(`Expected 2xx/3xx status, got ${response.status}`);
      }

      if (
        check.expectedBodyContains &&
        check.expectedBodyContains.trim() &&
        !bodyText.includes(check.expectedBodyContains)
      ) {
        bodyOk = false;
        errorMessages.push(`Expected body to contain '${check.expectedBodyContains}', not found`);
      }

      if (statusOk && bodyOk) {
        return {
          name: check.name,
          status: 'up',
          responseTimeMs: responseTime,
          error: '',
          attempts,
        };
      }

      lastError = errorMessages.join('; ');
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
