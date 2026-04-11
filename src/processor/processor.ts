import type { Config, Monitor } from '../config/types.js';
import type {
  CheckResult,
  MonitorState,
  Actions,
  DbWrite,
  AlertCall,
  StateUpdate,
} from './types.js';

export function processResults(
  results: CheckResult[],
  states: MonitorState[],
  config: Config
): Actions {
  const monitorMap = new Map<string, Monitor>();
  for (const m of config.monitors) {
    monitorMap.set(m.name, m);
  }

  const stateMap = new Map<string, MonitorState>();
  for (const s of states) {
    stateMap.set(s.monitor_name, s);
  }

  const now = Math.floor(Date.now() / 1000);
  const actions: Actions = {
    dbWrites: [],
    alerts: [],
    stateUpdates: [],
  };

  for (const result of results) {
    const monitor = monitorMap.get(result.name);
    if (!monitor) {
      continue;
    }

    const state = stateMap.get(result.name) ?? {
      monitor_name: result.name,
      current_status: 'up' as const,
      consecutive_failures: 0,
      last_status_change: 0,
      last_checked: 0,
    };

    const dbWrite: DbWrite = {
      monitorName: result.name,
      checkedAt: now,
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      errorMessage: result.error,
      attempts: result.attempts,
    };
    actions.dbWrites.push(dbWrite);

    const newState: StateUpdate = {
      monitorName: result.name,
      currentStatus: state.current_status,
      consecutiveFailures: state.consecutive_failures,
      lastStatusChange: state.last_status_change,
      lastChecked: now,
    };

    if (result.status === 'down') {
      newState.consecutiveFailures = state.consecutive_failures + 1;

      if (
        newState.consecutiveFailures >= monitor.failureThreshold &&
        state.current_status === 'up'
      ) {
        newState.currentStatus = 'down';
        newState.lastStatusChange = now;

        for (const alertName of monitor.alerts) {
          const alert: AlertCall = {
            alertName,
            monitorName: result.name,
            alertType: 'down',
            error: result.error,
            timestamp: now,
          };
          actions.alerts.push(alert);
        }
      }
    } else {
      newState.consecutiveFailures = 0;
      newState.currentStatus = 'up';

      if (state.current_status === 'down') {
        newState.lastStatusChange = now;

        for (const alertName of monitor.alerts) {
          const alert: AlertCall = {
            alertName,
            monitorName: result.name,
            alertType: 'recovery',
            error: '',
            timestamp: now,
          };
          actions.alerts.push(alert);
        }
      } else {
        newState.lastStatusChange = state.last_status_change;
      }
    }

    actions.stateUpdates.push(newState);
  }

  return actions;
}
