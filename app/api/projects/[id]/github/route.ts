import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { slugifyRepoName, pushToGitHub, GitHubApiError } from '@/lib/github'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Not available in dev mode' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, generated_files, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project.generated_files || Object.keys(project.generated_files as Record<string, string>).length === 0) {
    return NextResponse.json({ error: 'No files to push' }, { status: 400 })
  }

  // Load GitHub credentials from profiles
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service credentials' }, { status: 503 })
  }
  const adminClient = createServiceClient(serviceUrl, serviceKey)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('github_token, github_username')
    .eq('id', user.id)
    .single()

  if (!profile?.github_token || !profile?.github_username) {
    return NextResponse.json(
      { error: 'GitHub not connected. Please connect GitHub in Settings.' },
      { status: 401 }
    )
  }

  // Parse optional body
  let repoName: string
  let isPrivate = false
  try {
    const body = await request.json()
    repoName = body.repoName ? slugifyRepoName(body.repoName) : slugifyRepoName(project.name)
    isPrivate = body.isPrivate ?? false
  } catch {
    repoName = slugifyRepoName(project.name)
  }

  const files = project.generated_files as Record<string, string>

  try {
    const result = await pushToGitHub(
      profile.github_token,
      profile.github_username,
      files,
      { repoName, isPrivate }
    )

    // Store the repo URL in project metadata
    const existingMeta = (project.metadata as Record<string, unknown>) || {}
    await adminClient
      .from('projects')
      .update({ metadata: { ...existingMeta, github_repo_url: result.repoUrl } })
      .eq('id', id)

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof GitHubApiError) {
      // Repo name already exists — retry with suffix
      if (err.status === 422) {
        try {
          const suffix = Math.random().toString(36).slice(2, 6)
          const retryName = `${repoName}-${suffix}`
          const result = await pushToGitHub(
            profile.github_token,
            profile.github_username,
            files,
            { repoName: retryName, isPrivate }
          )

          const existingMeta = (project.metadata as Record<string, unknown>) || {}
          await adminClient
            .from('projects')
            .update({ metadata: { ...existingMeta, github_repo_url: result.repoUrl } })
            .eq('id', id)

          return NextResponse.json(result)
        } catch (retryErr) {
          const msg = retryErr instanceof GitHubApiError ? retryErr.message : 'Push failed'
          return NextResponse.json({ error: msg }, { status: 502 })
        }
      }

      if (err.status === 401) {
        return NextResponse.json(
          { error: 'GitHub token expired or revoked. Please reconnect in Settings.' },
          { status: 401 }
        )
      }

      return NextResponse.json({ error: err.message }, { status: 502 })
    }

    return NextResponse.json({ error: 'Failed to push to GitHub' }, { status: 500 })
  }
}
