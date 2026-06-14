-- M-4b: Carry isAllDay flag through the ingestion contract.
-- Stores the connector-level hint that a source event is all-day (no specific
-- start/end time). The normaliser reads this column and writes events.is_all_day
-- so all-day calendar events (markets, exhibitions, community days) are correctly
-- distinguished from timed events in sorting and display.
alter table external_events
  add column is_all_day_guess boolean not null default false;
