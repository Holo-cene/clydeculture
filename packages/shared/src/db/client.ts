import { createClient as _createClient } from '@supabase/supabase-js';

export function createClient(url: string, key: string) {
  return _createClient(url, key);
}
