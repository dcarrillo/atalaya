-- Indexes for status page & aggregation performance
CREATE INDEX idx_checked_at ON check_results(checked_at);
CREATE INDEX idx_hourly_timestamp ON check_results_hourly(hour_timestamp);

-- Optional covering index for aggregation queries
-- Includes all columns needed for hourly aggregation to avoid table lookups
CREATE INDEX idx_checked_at_monitor_covering ON check_results(checked_at, monitor_name, status, response_time_ms);