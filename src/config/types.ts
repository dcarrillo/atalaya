export type Settings = {
  defaultRetries: number;
  defaultRetryDelayMs: number;
  defaultTimeoutMs: number;
  defaultFailureThreshold: number;
  title?: string;
};

type AlertBase = { name: string };

export type WebhookAlert = AlertBase & {
  type: 'webhook';
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyTemplate: string;
};

export type Alert = WebhookAlert; // | EmailAlert | ...

interface MonitorBase {
  name: string;
  target: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  failureThreshold: number;
  alerts: string[];
  region?: string; // Cloudflare region code for regional checks
}

export interface HttpMonitor extends MonitorBase {
  type: 'http';
  method: string;
  expectedStatus: number;
  expectedBodyContains: string;
  headers: Record<string, string>;
}

export interface TcpMonitor extends MonitorBase {
  type: 'tcp';
}

export interface DnsMonitor extends MonitorBase {
  type: 'dns';
  recordType: string;
  expectedValues: string[];
}

export type Monitor = HttpMonitor | TcpMonitor | DnsMonitor;

export type Config = {
  settings: Settings;
  alerts: Alert[];
  monitors: Monitor[];
};

export type RawYamlConfig = {
  settings?: {
    default_retries?: number;
    default_retry_delay_ms?: number;
    default_timeout_ms?: number;
    default_failure_threshold?: number;
    title?: string; // New optional field
  };
  alerts?: Array<{
    type?: string;
    name?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body_template?: string;
  }>;
  monitors?: Array<{
    name?: string;
    type?: string;
    target?: string;
    method?: string;
    expected_status?: number;
    expected_body_contains?: string;
    headers?: Record<string, string>;
    record_type?: string;
    expected_values?: string[];
    timeout_ms?: number;
    retries?: number;
    retry_delay_ms?: number;
    failure_threshold?: number;
    alerts?: string[];
    region?: string; // Cloudflare region code for regional checks
  }>;
};
