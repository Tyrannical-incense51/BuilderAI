import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Dev mode: skip auth when Supabase is not configured
  if (!supabase) {
    const devUser = {
      id: 'dev-user',
      email: 'dev@builderai.local',
      display_name: 'Developer',
      avatar_url: undefined,
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar user={devUser} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const navUser = {
    id: user.id,
    email: user.email,
    display_name: profile?.display_name,
    avatar_url: profile?.avatar_url,
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar user={navUser} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
