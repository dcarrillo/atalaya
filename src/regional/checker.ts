import { DurableObject } from 'cloudflare:workers';
import { executeHttpCheck } from '../checks/http.js';
import { executeTcpCheck } from '../checks/tcp.js';
import { executeDnsCheck } from '../checks/dns.js';
import type { CheckRequest, CheckResult } from '../types.js';

export class RegionalChecker extends DurableObject {
  async runCheck(check: CheckRequest): Promise<CheckResult> {
    console.warn(JSON.stringify({ event: 'regional_check_run', monitor: check.name }));

    try {
      // Execute the check locally in this Durable Object's region
      switch (check.type) {
        case 'http': {
          return await executeHttpCheck(check);
        }

        case 'tcp': {
          return await executeTcpCheck(check);
        }

        case 'dns': {
          return await executeDnsCheck(check);
        }
      }

      // This should never happen due to TypeScript type checking
      // But we need to satisfy TypeScript's return type
      const exhaustiveCheck: never = check;
      throw new Error(`Unknown check type: ${String(exhaustiveCheck)}`);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'regional_checker_error',
          monitor: check.name,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return {
        name: check.name,
        status: 'down',
        responseTimeMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: 1,
      };
    }
  }

  async kill(): Promise<void> {
    // No-op: Cloudflare automatically hibernates inactive Durable Objects
    // There's no need to force termination, and doing so would log errors
  }
}
