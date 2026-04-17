import { checkAuth } from '../status-page/src/lib/auth.js';
import { handleAggregation } from './aggregation.js';
import { executeDnsCheck } from './checks/dns.js';
import { executeHttpCheck } from './checks/http.js';
import { executeTcpCheck } from './checks/tcp.js';
import { parseConfig } from './config/index.js';
import { prepareChecks } from './checker/index.js';
import { processResults } from './processor/index.js';
import { formatWebhookPayload } from './alert/index.js';
import { getMonitorStates, writeCheckResults, updateMonitorStates, recordAlert } from './db.js';
import { interpolateSecrets } from './utils/interpolate.js';
import type { Env } from './types.js';
import type { CheckRequest } from './checker/types.js';
import type { CheckResult } from './processor/types.js';
import type { Config } from './config/types.js';

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const authResponse = await checkAuth(request, env);
    if (authResponse) {
      return authResponse;
    }

    // Only cache GET requests when status page is public
    let cacheKey: Request | undefined;
    if (request.method === 'GET' && env.STATUS_PUBLIC === 'true') {
      // Create normalized cache key to prevent bypass via query params, headers, or cookies
      const normalizedUrl = new URL(url);
      normalizedUrl.search = ''; // Remove query parameters
      normalizedUrl.hash = ''; // Remove hash fragment
      cacheKey = new Request(normalizedUrl.toString());

      const cachedResponse = await caches.default.match(cacheKey);
      if (cachedResponse) {
        console.log(
          JSON.stringify({
            event: 'cache_hit',
            url: url.toString(),
            normalizedUrl: normalizedUrl.toString(),
          })
        );
        return cachedResponse;
      }

      console.log(
        JSON.stringify({
          event: 'cache_miss',
          url: url.toString(),
          normalizedUrl: normalizedUrl.toString(),
        })
      );
    }

    // Try static assets first (CSS, JS, favicon, etc.)
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    // Delegate to Astro SSR app for page rendering
    try {
      const astroMod: { default: ExportedHandler } = await import(
        // @ts-expect-error -- build artifact, resolved at bundle time
        '../status-page/dist/server/index.mjs'
      );
      if (astroMod.default.fetch) {
        const response = await astroMod.default.fetch(
          request as unknown as Request<unknown, IncomingRequestCfProperties>,
          env,
          ctx
        );

        // Cache successful responses when status page is public
        if (
          request.method === 'GET' &&
          env.STATUS_PUBLIC === 'true' &&
          response.status === 200 &&
          cacheKey
        ) {
          const responseWithCache = new Response(response.body, response);
          responseWithCache.headers.set('Cache-Control', 'public, max-age=60');

          ctx.waitUntil(caches.default.put(cacheKey, responseWithCache.clone()));

          return responseWithCache;
        }

        return response;
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error(JSON.stringify({ event: 'astro_ssr_error', error: String(error) }));
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(event: ScheduledController, env: Env, _: ExecutionContext): Promise<void> {
    if (event.cron === '0 * * * *') {
      await handleAggregation(env);
      return;
    }

    try {
      const configYaml = interpolateSecrets(env.MONITORS_CONFIG, env);
      const config = parseConfig(configYaml);

      const checks = prepareChecks(config);

      if (checks.length === 0) {
        console.warn(JSON.stringify({ event: 'no_monitors_configured' }));
        return;
      }

      const results = await executeAllChecks(checks, env);

      const states = await getMonitorStates(env.DB);
      const actions = processResults(results, states, config);

      await writeCheckResults(env.DB, actions.dbWrites);
      await updateMonitorStates(env.DB, actions.stateUpdates);

      await Promise.all(
        actions.alerts.map(async alert => {
          const success = await sendWebhook(alert, config);
          await recordAlert(env.DB, alert.monitorName, alert.alertType, alert.alertName, success);
        })
      );

      console.info(
        JSON.stringify({
          event: 'scheduled_complete',
          checks: checks.length,
          alerts: actions.alerts.length,
        })
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'scheduled_error',
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;

async function executeAllChecks(checks: CheckRequest[], env: Env): Promise<CheckResult[]> {
  const promises = checks.map(async check => executeCheck(check, env));
  return Promise.all(promises);
}

async function executeCheck(check: CheckRequest, env: Env): Promise<CheckResult> {
  // If region is specified and we have Durable Object binding, run check from that region
  if (check.region && env.REGIONAL_CHECKER_DO) {
    try {
      console.info(
        JSON.stringify({ event: 'regional_check_start', monitor: check.name, region: check.region })
      );

      // Create Durable Object ID from monitor name
      const doId = env.REGIONAL_CHECKER_DO.idFromName(check.name);
      const doStub = env.REGIONAL_CHECKER_DO.get(doId, {
        locationHint: check.region as DurableObjectLocationHint,
      });

      type RegionalCheckerStub = {
        runCheck: (check: CheckRequest) => Promise<CheckResult>;
        kill: () => Promise<void>;
      };

      const typedStub = doStub as unknown as RegionalCheckerStub;
      const result = await typedStub.runCheck(check);

      // Kill the Durable Object to save resources
      try {
        await typedStub.kill();
      } catch {
        // Ignore kill errors - Durable Object will be garbage collected
      }

      console.info(
        JSON.stringify({
          event: 'regional_check_complete',
          monitor: check.name,
          region: check.region,
          status: result.status,
        })
      );
      return result;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'regional_check_error',
          monitor: check.name,
          region: check.region,
          error: error instanceof Error ? error.message : String(error),
        })
      );

      // Fall back to local check
      console.warn(JSON.stringify({ event: 'regional_check_fallback', monitor: check.name }));
      return executeLocalCheck(check);
    }
  } else {
    // Run check locally (current behavior)
    return executeLocalCheck(check);
  }
}

async function executeLocalCheck(check: CheckRequest): Promise<CheckResult> {
  console.info(JSON.stringify({ event: 'local_check_start', monitor: check.name }));
  switch (check.type) {
    case 'http': {
      return executeHttpCheck(check);
    }

    case 'tcp': {
      return executeTcpCheck(check);
    }

    case 'dns': {
      return executeDnsCheck(check);
    }
  }
}

async function sendWebhook(
  alert: {
    alertName: string;
    monitorName: string;
    alertType: string;
    error: string;
    timestamp: number;
  },
  config: Config
): Promise<boolean> {
  try {
    const payload = formatWebhookPayload({
      alertName: alert.alertName,
      monitorName: alert.monitorName,
      alertType: alert.alertType,
      error: alert.error,
      timestamp: alert.timestamp,
      config,
    });

    if (!payload.url) {
      console.error(JSON.stringify({ event: 'webhook_not_found', alert: alert.alertName }));
      return false;
    }

    const response = await fetch(payload.url, {
      method: payload.method,
      headers: payload.headers,
      body: payload.body,
    });

    return response.ok;
  } catch (error_) {
    console.error(
      JSON.stringify({
        event: 'webhook_failed',
        alert: alert.alertName,
        error: error_ instanceof Error ? error_.message : String(error_),
      })
    );
    return false;
  }
}

export { RegionalChecker } from './regional/checker.js';
