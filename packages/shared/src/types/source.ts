export type SourceType = 'api' | 'rss' | 'ical' | 'html' | 'apify' | 'manual';

export interface Source {
  id: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  config: Record<string, unknown>;
  isActive: boolean;
}
