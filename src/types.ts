interface CheckRequestBase {
  name: string;
  target: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  region?: string; // Cloudflare region code like 'weur', 'enam', etc.
}

export interface HttpCheckRequest extends CheckRequestBase {
  type: 'http';
  method?: string;
  expectedStatus?: number;
  headers?: Record<string, string>;
}

export interface TcpCheckRequest extends CheckRequestBase {
  type: 'tcp';
}

export interface DnsCheckRequest extends CheckRequestBase {
  type: 'dns';
  recordType?: string;
  expectedValues?: string[];
}

export type CheckRequest = HttpCheckRequest | TcpCheckRequest | DnsCheckRequest;

export type CheckResult = {
  name: string;
  status: 'up' | 'down';
  responseTimeMs: number;
  error: string;
  attempts: number;
};

// Note: snake_case field names match the D1 database schema
export type MonitorState = {
  monitor_name: string;
  current_status: 'up' | 'down';
  consecutive_failures: number;
  last_status_change: number;
  last_checked: number;
};

export type Actions = {
  dbWrites: DbWrite[];
  alerts: AlertCall[];
  stateUpdates: StateUpdate[];
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
  alertName: string;
  monitorName: string;
  alertType: 'down' | 'recovery';
  error: string;
  timestamp: number;
};

export type StateUpdate = {
  monitorName: string;
  currentStatus: string;
  consecutiveFailures: number;
  lastStatusChange: number;
  lastChecked: number;
};

export type WebhookPayload = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

export type Env = {
  DB: D1Database;
  MONITORS_CONFIG: string;
  STATUS_USERNAME?: string;
  STATUS_PASSWORD?: string;
  STATUS_PUBLIC?: string;
  REGIONAL_CHECKER_DO?: DurableObjectNamespace;
  ASSETS?: Fetcher;
  STATUS_BANNER_URL?: string;
  STATUS_BANNER_LINK?: string;
};

// Status API response types (consumed by Pages project via service binding)
export type StatusApiResponse = {
  monitors: ApiMonitorStatus[];
  summary: {
    total: number;
    operational: number;
    down: number;
  };
  lastUpdated: number;
  title: string;
};

export type ApiMonitorStatus = {
  name: string;
  status: 'up' | 'down' | 'unknown';
  lastChecked: number | undefined;
  uptimePercent: number;
  dailyHistory: ApiDayStatus[];
  recentChecks: ApiRecentCheck[];
};

export type ApiDayStatus = {
  date: string;
  uptimePercent: number | undefined;
};

export type ApiRecentCheck = {
  timestamp: number;
  status: 'up' | 'down';
  responseTimeMs: number;
};
