export type SourceType = 'api' | 'rss' | 'ical' | 'html' | 'apify' | 'manual';
export type SourceStatus = 'ok' | 'degraded' | 'broken' | 'disabled';

export interface Source {
  id: string;
  name: string;
  slug: string;
  source_type: SourceType;
  tier: number;
  config: Record<string, unknown>;
  status: SourceStatus;
  enabled: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
