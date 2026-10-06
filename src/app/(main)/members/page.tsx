import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MembersPageClient } from '@/components/members/MembersPageClient'

export default async function MembersPage() {
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

    // owner / manager만 접근 가능
    if (profile.role !== 'owner' && profile.role !== 'manager') {
      redirect('/journal/task')
    }

    return <MembersPageClient profile={profile} />
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
