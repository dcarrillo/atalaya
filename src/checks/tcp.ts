import { connect } from 'cloudflare:sockets';
import type { TcpCheckRequest, CheckResult } from '../types.js';
import { sleep } from './utils.js';

export async function executeTcpCheck(check: TcpCheckRequest): Promise<CheckResult> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError = '';

  const parts = check.target.split(':');
  if (parts.length !== 2) {
    return {
      name: check.name,
      status: 'down',
      responseTimeMs: 0,
      error: 'Invalid target format (expected host:port)',
      attempts: 1,
    };
  }

  const [hostname, portString] = parts;
  const port = Number.parseInt(portString, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65_535) {
    return {
      name: check.name,
      status: 'down',
      responseTimeMs: 0,
      error: 'Invalid port number',
      attempts: 1,
    };
  }

  for (let i = 0; i <= check.retries; i++) {
    attempts++;
    let socket: ReturnType<typeof connect> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      socket = connect({ hostname, port });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, check.timeoutMs);
      });

      await Promise.race([socket.opened, timeoutPromise]);

      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      await socket.close();

      return {
        name: check.name,
        status: 'up',
        responseTimeMs: Date.now() - startTime,
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

      if (socket) {
        try {
          await socket.close();
        } catch {
          /* ignore */
        }
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
