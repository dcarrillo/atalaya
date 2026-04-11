-- Hourly aggregated check results for data retention
CREATE TABLE check_results_hourly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_name TEXT NOT NULL,
  hour_timestamp INTEGER NOT NULL,
  total_checks INTEGER NOT NULL,
  successful_checks INTEGER NOT NULL,
  failed_checks INTEGER NOT NULL,
  avg_response_time_ms INTEGER,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER
);

CREATE UNIQUE INDEX idx_hourly_monitor_hour ON check_results_hourly(monitor_name, hour_timestamp);
