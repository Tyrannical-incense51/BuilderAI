import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/projects/[id]/duplicate')

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestId = getRequestId(request)
  const supabase = await createClient()

  // Dev mode
  if (!supabase) {
    return NextResponse.json({
      project: {
        id: randomUUID(),
        name: 'Duplicated Project',
        status: 'complete',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }, { status: 201 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })

  // Fetch the original project
  const { data: original, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !original) {
    return errorResponse(ErrorCode.NOT_FOUND, 'Project not found', { requestId })
  }

  // Create the duplicate
  const { data: duplicate, error: insertError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: `${original.name} (copy)`,
      description: original.description,
      prompt: original.prompt,
      status: original.status === 'building' ? 'complete' : original.status,
      blueprint: original.blueprint,
      generated_files: original.generated_files,
      metadata: original.metadata,
    })
    .select()
    .single()

  if (insertError) {
    logger.error('Failed to duplicate project', { id, error: insertError.message, requestId })
    return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to duplicate project', {
      requestId,
      details: insertError.message,
    })
  }

  logger.info('Project duplicated', { original: id, duplicate: duplicate.id })
  return NextResponse.json({ project: duplicate }, { status: 201 })
}
