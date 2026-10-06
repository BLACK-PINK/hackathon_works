import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SchedulerTabs } from '@/components/scheduler/SchedulerTabs'

export default async function SchedulerPage() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*, company:companies(*)')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.company_id) redirect('/onboarding')

    return <SchedulerTabs profile={profile} />
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
