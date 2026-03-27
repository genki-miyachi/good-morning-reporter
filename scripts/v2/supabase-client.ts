import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_KEY;
      if (!url || !key) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
      }
      _supabase = createClient(url, key);
    }
    return (_supabase as unknown as Record<string, unknown>)[prop as string];
  },
});
