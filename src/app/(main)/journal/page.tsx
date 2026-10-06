import { redirect } from 'next/navigation'

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; userId?: string; projectId?: string }>
}) {
  const { tab, date, userId, projectId } = await searchParams

  if (tab === 'site') {
    const params = new URLSearchParams()
    if (date) params.set('date', date)
    if (projectId) params.set('projectId', projectId)
    redirect(`/journal/site${params.size ? '?' + params.toString() : ''}`)
  }

  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (userId) params.set('userId', userId)
  redirect(`/journal/task${params.size ? '?' + params.toString() : ''}`)
}

