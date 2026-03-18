import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const adminClient = createServiceClient(serviceUrl, serviceKey)

  const { data, error } = await adminClient
    .from('projects')
    .select('id, name, prompt, generated_files, created_at, is_public')
    .eq('id', id)
    .eq('is_public', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found or not public' }, { status: 404 })
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    prompt: data.prompt,
    generated_files: data.generated_files,
    created_at: data.created_at,
  })
}
