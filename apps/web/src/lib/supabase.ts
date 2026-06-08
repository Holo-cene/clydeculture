import { createClient, type PublicQueryClient } from '@clydeculture/shared';

export function getPublicSupabaseClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are required');
  }

  return createClient(url, anonKey);
}

export function getPublicQueryClient(): PublicQueryClient {
  return getPublicSupabaseClient() as unknown as PublicQueryClient;
}
