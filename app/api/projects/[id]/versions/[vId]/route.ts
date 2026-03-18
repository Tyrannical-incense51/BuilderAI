import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; vId: string }> }
) {
  const { id, vId } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ version: null })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })

  // Verify the project belongs to this user
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) return errorResponse(ErrorCode.NOT_FOUND, 'Project not found', { requestId })

  const { data: version, error } = await supabase
    .from('project_versions')
    .select('*')
    .eq('id', vId)
    .eq('project_id', id)
    .single()

  if (error || !version) return errorResponse(ErrorCode.NOT_FOUND, 'Version not found', { requestId })

  return NextResponse.json({ version })
}
