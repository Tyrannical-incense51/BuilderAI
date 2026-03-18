import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const VERCEL_API = 'https://api.vercel.com'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const deploymentId = searchParams.get('deploymentId')

  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not available in dev mode' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Load Vercel token
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 })
  }
  const adminClient = createServiceClient(serviceUrl, serviceKey)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('vercel_token')
    .eq('id', user.id)
    .single()

  if (!profile?.vercel_token) {
    return NextResponse.json({ error: 'Vercel not connected' }, { status: 401 })
  }

  try {
    const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${profile.vercel_token}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Vercel API error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json() as { readyState: string; url: string }

    return NextResponse.json({
      state: data.readyState, // QUEUED, BUILDING, READY, ERROR, CANCELED
      url: `https://${data.url}`,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to check deployment status' }, { status: 500 })
  }
}
