import type { DnsCheckRequest, CheckResult } from '../types.js';
import { sleep } from './utils.js';

type DnsResponse = {
  Answer?: Array<{ data: string }>;
};

export async function executeDnsCheck(check: DnsCheckRequest): Promise<CheckResult> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError = '';

  const recordType = check.recordType ?? 'A';
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(check.target)}&type=${recordType}`;

  for (let i = 0; i <= check.retries; i++) {
    attempts++;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      timeout = setTimeout(() => {
        controller.abort();
      }, check.timeoutMs);

      const response = await fetch(dohUrl, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      timeout = undefined;

      if (!response.ok) {
        lastError = `DNS query failed: ${response.status}`;
        if (i < check.retries) {
          await sleep(check.retryDelayMs);
          continue;
        }

        return {
          name: check.name,
          status: 'down',
          responseTimeMs: Date.now() - startTime,
          error: lastError,
          attempts,
        };
      }

      const data: DnsResponse = await response.json();
      const responseTime = Date.now() - startTime;

      const { expectedValues } = check;
      if (!expectedValues || expectedValues.length === 0) {
        return {
          name: check.name,
          status: 'up',
          responseTimeMs: responseTime,
          error: '',
          attempts,
        };
      }

      const resolvedValues = data.Answer?.map(a => a.data) ?? [];
      const allExpectedFound = expectedValues.every(expected => resolvedValues.includes(expected));

      if (allExpectedFound) {
        return {
          name: check.name,
          status: 'up',
          responseTimeMs: responseTime,
          error: '',
          attempts,
        };
      }

      lastError = `Expected ${expectedValues.join(', ')}, got ${resolvedValues.join(', ')}`;
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
