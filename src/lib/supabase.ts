import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until both values are in .env.local — the app then shows a setup screen instead of login. */
export const supabaseConfigured = Boolean(url && key)

export const supabase = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        // Email links come back as ?code=… (not a #fragment), which plays nicely with the hash router.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
