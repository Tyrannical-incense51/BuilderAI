import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/projects/[id]')

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ project: { id, name: 'Dev Project', status: 'idle' } })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return errorResponse(ErrorCode.NOT_FOUND, 'Project not found', { requestId })
  }

  return NextResponse.json({ project: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) {
    const body = await request.json()
    return NextResponse.json({ project: { id, ...body } })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })

  const body = await request.json()
  const allowedFields = ['name', 'description', 'status', 'blueprint', 'generated_files', 'metadata']
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    logger.error('Failed to update project', { id, error: error.message, requestId })
    return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to update project', { requestId, details: error.message })
  }

  return NextResponse.json({ project: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) return NextResponse.json({ success: true })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    logger.error('Failed to delete project', { id, error: error.message, requestId })
    return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to delete project', { requestId, details: error.message })
  }

  return NextResponse.json({ success: true })
}
