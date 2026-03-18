import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardHub } from '@/components/dashboard/DashboardHub'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Dev mode: skip auth and DB when Supabase is not configured
  if (!supabase) {
    return <DashboardHub displayName="Developer" projects={[]} />
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, updated_at, generated_files')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(5)

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  return (
    <DashboardHub
      displayName={profile?.display_name?.split(' ')[0]}
      projects={projects || []}
    />
  )
}
