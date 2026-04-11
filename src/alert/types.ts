export type TemplateData = {
  event: string;
  monitor: {
    name: string;
    type: string;
    target: string;
  };
  status: {
    current: string;
    previous: string;
    consecutiveFailures: number;
    lastStatusChange: string;
    downtimeDurationSeconds: number;
  };
  check: {
    timestamp: string;
    responseTimeMs: number;
    attempts: number;
    error: string;
  };
};

export type WebhookPayload = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};
