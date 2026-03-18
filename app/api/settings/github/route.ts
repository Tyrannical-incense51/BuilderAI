import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ connected: false, username: null })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use service-role to read github_token (may be protected by RLS)
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ connected: false, username: null })
  }
  const adminClient = createServiceClient(serviceUrl, serviceKey)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('github_token, github_username')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    connected: !!profile?.github_token,
    username: profile?.github_username ?? null,
  })
}
