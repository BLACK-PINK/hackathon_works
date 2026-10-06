import { redirect } from 'next/navigation'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const tab = params?.tab
  if (tab) {
    redirect(`/finance/dashboard?tab=${tab}`)
  }
  redirect('/finance/dashboard')
}
