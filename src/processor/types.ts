export type CheckResult = {
  name: string;
  status: 'up' | 'down';
  responseTimeMs: number;
  error: string;
  attempts: number;
};

export type MonitorState = {
  monitor_name: string;
  current_status: 'up' | 'down' | 'maintenance';
  consecutive_failures: number;
  last_status_change: number;
  last_checked: number;
};

export type DbWrite = {
  monitorName: string;
  checkedAt: number;
  status: string;
  responseTimeMs: number;
  errorMessage: string;
  attempts: number;
};

export type AlertCall = {
  alertName: string; // name from config
  monitorName: string;
  alertType: 'down' | 'recovery';
  error: string;
  timestamp: number;
};

export type StateUpdate = {
  monitorName: string;
  currentStatus: 'up' | 'down' | 'maintenance';
  consecutiveFailures: number;
  lastStatusChange: number;
  lastChecked: number;
};

export type Actions = {
  dbWrites: DbWrite[];
  alerts: AlertCall[]; // renamed from webhooks
  stateUpdates: StateUpdate[];
};
