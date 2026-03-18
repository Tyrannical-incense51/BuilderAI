import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectGrid } from '@/components/dashboard/ProjectGrid'

export default async function ProjectsPage() {
  const supabase = await createClient()

  // Dev mode: skip auth and DB when Supabase is not configured
  if (!supabase) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all your generated applications
          </p>
        </div>
        <ProjectGrid projects={[]} />
      </div>
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {projects?.length || 0} project{projects?.length !== 1 ? 's' : ''} total
        </p>
      </div>
      <ProjectGrid projects={projects || []} />
    </div>
  )
}
