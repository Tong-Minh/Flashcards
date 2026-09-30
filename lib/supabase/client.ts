import { createClient } from '@supabase/supabase-js'

// The desktop app never talks to Supabase, but web-only components still import this client, so
// it gets placeholder settings there instead of failing when the build has no Supabase env vars.
const desktop = process.env.NEXT_PUBLIC_TARGET === 'desktop'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || (desktop ? 'http://localhost' : ''),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || (desktop ? 'desktop' : ''),
  {
    auth: {
      autoRefreshToken: !desktop,
      persistSession: !desktop,
      detectSessionInUrl: !desktop,
    },
  }
)
