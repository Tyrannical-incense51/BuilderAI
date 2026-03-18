import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdminClient() {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) return null
  return createServiceClient(serviceUrl, serviceKey)
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ connected: false })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ connected: false })
    }

    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('vercel_token')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('[vercel GET] Profile query error:', error.message)
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({ connected: !!profile?.vercel_token })
  } catch (err) {
    console.error('[vercel GET] Error:', err)
    return NextResponse.json({ connected: false })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not available in dev mode' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { token } = body
    if (!token || typeof token !== 'string' || token.length < 20) {
      return NextResponse.json({ error: 'Invalid Vercel token' }, { status: 400 })
    }

    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ error: 'Server configuration error: missing service credentials' }, { status: 503 })
    }

    // Use upsert to handle case where profile row may not exist yet
    const { error } = await adminClient
      .from('profiles')
      .upsert(
        { id: user.id, vercel_token: token },
        { onConflict: 'id' }
      )

    if (error) {
      console.error('[vercel POST] Save error:', error.message, error.details)
      return NextResponse.json({ error: `Failed to save token: ${error.message}` }, { status: 500 })
    }

    // Verify it was actually saved
    const { data: check } = await adminClient
      .from('profiles')
      .select('vercel_token')
      .eq('id', user.id)
      .single()

    if (!check?.vercel_token) {
      console.error('[vercel POST] Token not persisted after upsert — column may not exist')
      return NextResponse.json({ error: 'Token was not saved. The vercel_token column may not exist — run migration 005_deploy.sql' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[vercel POST] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Not available in dev mode' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = getAdminClient()
    if (!adminClient) {
      return NextResponse.json({ error: 'Server configuration error: missing service credentials' }, { status: 503 })
    }

    const { error } = await adminClient
      .from('profiles')
      .update({ vercel_token: null })
      .eq('id', user.id)

    if (error) {
      console.error('[vercel DELETE] Error:', error.message)
      return NextResponse.json({ error: `Failed to remove token: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[vercel DELETE] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
