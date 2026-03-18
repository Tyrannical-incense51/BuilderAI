import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Return null when Supabase is not configured (local dev)
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.startsWith('your_') || supabaseAnonKey.startsWith('your_')) {
    return null
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
