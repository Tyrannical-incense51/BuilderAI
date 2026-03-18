import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ versions: [] })
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

  const { data: versions, error } = await supabase
    .from('project_versions')
    .select('id, version_number, prompt, file_count, created_at')
    .eq('project_id', id)
    .order('version_number', { ascending: false })

  if (error) return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to fetch versions', { requestId })

  return NextResponse.json({ versions: versions || [] })
}
