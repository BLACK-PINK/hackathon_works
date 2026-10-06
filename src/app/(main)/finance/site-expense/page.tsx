import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteExpensePageClient } from '@/components/finance/SiteExpensePageClient'

export default async function SiteExpensePage() {
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

    return <SiteExpensePageClient profile={profile} />
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
