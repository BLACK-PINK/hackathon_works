import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TaskJournalPageClient } from '@/components/journal/TaskJournalPageClient'

export default async function TaskJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; userId?: string }>
}) {
  try {
    const supabase = await createClient()
    const { date, userId } = await searchParams

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*, company:companies(*)')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.company_id) redirect('/onboarding')

    return (
      <TaskJournalPageClient
        profile={profile}
        initialDate={date}
        initialUserId={userId}
      />
    )
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
