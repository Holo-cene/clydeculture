-- M-4: Carry timeTba flag through the ingestion contract.
-- Stores the connector-level hint that a Ticketmaster (or other source) event
-- has a known date but no reliable time. The normaliser reads this column and
-- writes events.time_tba = true so TBA events are never silently treated as
-- real midnight events in sorting, dedupe, or confidence scoring.
alter table external_events
  add column time_tba_guess boolean not null default false;
