import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteJournalPageClient } from '@/components/journal/SiteJournalPageClient'

export default async function SiteJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; projectId?: string }>
}) {
  try {
    const supabase = await createClient()
    const { date, projectId } = await searchParams

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*, company:companies(*)')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.company_id) redirect('/onboarding')

    return (
      <SiteJournalPageClient
        profile={profile}
        initialDate={date}
        initialProjectId={projectId}
      />
    )
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
