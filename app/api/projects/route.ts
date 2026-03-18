import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { errorResponse, ErrorCode, getRequestId } from '@/lib/errors'
import { createProjectSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const supabase = await createClient()

  // Dev mode: return empty projects
  if (!supabase) {
    return NextResponse.json({ projects: [] })
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to fetch projects', {
      requestId,
      details: error.message,
    })
  }

  return NextResponse.json({ projects: data })
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const supabase = await createClient()

  const body = await request.json()

  // Validate input
  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid project data', {
      requestId,
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { name, prompt, description } = parsed.data

  // Dev mode: return a mock project
  if (!supabase) {
    const mockProject = {
      id: randomUUID(),
      user_id: 'dev-user',
      name,
      prompt,
      description: description || '',
      status: 'draft',
      generated_files: null,
      blueprint: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return NextResponse.json({ project: mockProject }, { status: 201 })
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', { requestId })
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name,
      prompt,
      description,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    return errorResponse(ErrorCode.DATABASE_ERROR, 'Failed to create project', {
      requestId,
      details: error.message,
    })
  }

  return NextResponse.json({ project: data }, { status: 201 })
}
