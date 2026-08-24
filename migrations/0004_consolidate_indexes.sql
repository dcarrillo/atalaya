-- Consolidate check_results indexes to reduce write amplification.
-- The covering index (checked_at, monitor_name, status, response_time_ms)
-- already has checked_at as its leading column, so idx_checked_at is redundant.
-- idx_results_monitor_time (monitor_name, checked_at DESC) is unused by current
-- read paths (no query filters by monitor_name on check_results).
DROP INDEX IF EXISTS idx_checked_at;
DROP INDEX IF EXISTS idx_results_monitor_time;
