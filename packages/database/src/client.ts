import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Only invoke in server code. Service-role credentials must never reach a browser bundle. */
export function createServerClient(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('Database client is server-only');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
