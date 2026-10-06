import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FinancePageClient } from '@/components/finance/FinancePageClient'

const VALID_TABS = [
  'dashboard', 'cash', 'ledger', 'payment-schedule',
  'revenue-schedule', 'sga', 'project-pl', 'company-pl'
] as const
type FinanceTab = typeof VALID_TABS[number]

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
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

    const params = await searchParams
    const tabParam = params?.tab
    const initialTab = VALID_TABS.includes(tabParam as FinanceTab)
      ? (tabParam as FinanceTab)
      : 'dashboard'

    return <FinancePageClient profile={profile} initialTab={initialTab} />
  } catch (e: any) {
    if (e?.message === 'SUPABASE_NOT_CONFIGURED') redirect('/login')
    throw e
  }
}
