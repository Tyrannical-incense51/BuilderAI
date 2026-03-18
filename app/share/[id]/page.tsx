import { notFound } from 'next/navigation'
import { ShareViewer } from './ShareViewer'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SharePage({ params }: Props) {
  const { id } = await params

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceUrl || !serviceKey) {
    // Dev mode: show a placeholder
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Sharing is not available in dev mode without Supabase.</p>
      </div>
    )
  }

  const { createClient } = await import('@supabase/supabase-js')
  const adminClient = createClient(serviceUrl, serviceKey)

  const { data } = await adminClient
    .from('projects')
    .select('id, name, prompt, generated_files, created_at, is_public')
    .eq('id', id)
    .eq('is_public', true)
    .single()

  if (!data) notFound()

  return (
    <ShareViewer
      id={data.id}
      name={data.name}
      prompt={data.prompt}
      files={data.generated_files as Record<string, string> ?? {}}
      createdAt={data.created_at}
    />
  )
}
