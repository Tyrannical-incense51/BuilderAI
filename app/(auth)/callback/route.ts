import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    if (!supabase) {
      // Dev mode: just redirect to dashboard
      return NextResponse.redirect(`${origin}/dashboard`)
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // provider_token is only available in the exchangeCodeForSession response,
      // NOT from getSession() — so we must use it from `data.session` directly
      const session = data.session

      if (session?.provider_token) {
        const githubToken = session.provider_token
        const githubUsername =
          session.user?.user_metadata?.user_name ??
          session.user?.user_metadata?.preferred_username ??
          null

        // Store GitHub token + username in profiles (service-role to bypass RLS)
        const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (serviceUrl && serviceKey) {
          const adminClient = createServiceClient(serviceUrl, serviceKey)
          await adminClient
            .from('profiles')
            .update({
              github_token: githubToken,
              github_username: githubUsername,
            })
            .eq('id', session.user.id)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
