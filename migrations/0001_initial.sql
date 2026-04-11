CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_name TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  attempts INTEGER NOT NULL
);

CREATE INDEX idx_results_monitor_time ON check_results(monitor_name, checked_at DESC);

CREATE TABLE monitor_state (
  monitor_name TEXT PRIMARY KEY,
  current_status TEXT NOT NULL,
  consecutive_failures INTEGER DEFAULT 0,
  last_status_change INTEGER,
  last_checked INTEGER
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_name TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  alert_name TEXT NOT NULL,
  success INTEGER NOT NULL
);

CREATE INDEX idx_alerts_monitor ON alerts(monitor_name, sent_at DESC);
