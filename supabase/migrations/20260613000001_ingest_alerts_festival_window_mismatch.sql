-- ============================================================================
-- Migration: extend ingest_alerts.alert_type to include
--            'festival_window_mismatch'.
--
-- Purpose:   FESTIVALS.md says events that match a festival rule but fall
--            outside the festival's date window are stored as ordinary events
--            and the condition is logged to ingest_alerts. The existing CHECK
--            constraint on alert_type does not list this alert kind, so any
--            insert attempt would violate the constraint.
--
-- Issue:     #12 (Festival detection: detector + override table + window-mismatch alert)
-- ============================================================================

alter table ingest_alerts
  drop constraint if exists ingest_alerts_alert_type_check;

alter table ingest_alerts
  add constraint ingest_alerts_alert_type_check
  check (alert_type in (
    'count_drop',
    'parse_failure',
    'timeout',
    'manual',
    'cold_start_zero',
    'festival_window_mismatch'   -- event matched a festival rule but start_at
                                 -- fell outside [festivals.start_date, end_date]
  ));
