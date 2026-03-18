import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; vId: string }> }
) {
  const { id, vId } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ project: null })
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

  // Fetch the version to restore
  const { data: version, error: versionError } = await supabase
    .from('project_versions')
    .select('files, blueprint')
    .eq('id', vId)
    .eq('project_id', id)
    .single()

  if (versionError || !version) return errorResponse(ErrorCode.NOT_FOUND, 'Version not found', { requestId })

  // Restore project files from this version
  const { data: updated, error: updateError } = await supabase
    .from('projects')
    .update({
      generated_files: version.files,
      blueprint: version.blueprint ?? null,
      status: 'complete',
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (updateError) return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to restore version', { requestId })

  return NextResponse.json({ project: updated })
}
