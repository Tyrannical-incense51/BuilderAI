import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BuilderInterface } from '@/components/BuilderInterface'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Dev mode: create a mock project when Supabase is not configured
  if (!supabase) {
    const devProject = {
      id,
      name: 'Dev Project',
      description: '',
      prompt: '',
      status: 'draft' as const,
      user_id: 'dev-user',
      generated_files: undefined,
      blueprint: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    return (
      <BuilderInterface
        project={devProject}
        initialMessages={[]}
      />
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !project) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  return (
    <BuilderInterface
      project={project}
      initialMessages={messages || []}
    />
  )
}
