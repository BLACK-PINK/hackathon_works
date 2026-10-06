import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const cid = profile.company_id

    // 전체 daily_tasks 수
    const { count: totalCount } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)

    // project_id NULL인 것 수
    const { count: nullProjectCount } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)
      .is('project_id', null)

    // project_id 있는 것 수
    const { count: withProjectCount } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)
      .not('project_id', 'is', null)

    // 최근 10개 데이터
    const { data: recent } = await supabase
      .from('daily_tasks')
      .select('id, date, title, project_id, created_by, created_at')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
      .limit(10)

    // 날짜별 개수 (최근 30일)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: byDate } = await supabase
      .from('daily_tasks')
      .select('date')
      .eq('company_id', cid)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })

    // 날짜별 집계
    const dateCount: Record<string, number> = {}
    for (const r of (byDate || [])) {
      dateCount[r.date] = (dateCount[r.date] || 0) + 1
    }

    // 멤버별 개수
    const { data: allTasks } = await supabase
      .from('daily_tasks')
      .select('created_by, date')
      .eq('company_id', cid)
      .order('date', { ascending: false })
      .limit(500)

    const memberCount: Record<string, number> = {}
    for (const r of (allTasks || [])) {
      memberCount[r.created_by] = (memberCount[r.created_by] || 0) + 1
    }

    return NextResponse.json({
      company_id: cid,
      totalCount,
      nullProjectCount,
      withProjectCount,
      recent,
      dateCountLast30Days: dateCount,
      memberTaskCount: memberCount,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
