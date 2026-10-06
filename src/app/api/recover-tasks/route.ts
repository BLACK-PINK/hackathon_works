import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 현재 daily_tasks 데이터 현황 조회
export async function GET() {
  try {
    // 1. 로그인한 사용자 확인 (일반 anon 클라이언트 — RLS 정책 적용됨)
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 })
    }

    // 2. 프로필 조회
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.company_id) {
      return NextResponse.json({ error: 'No company', detail: profileError?.message }, { status: 400 })
    }

    const cid = profile.company_id

    // 3. daily_tasks 전체 카운트 (RLS: 자신의 company_id만 조회됨)
    const { count: total, error: countError } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)

    if (countError) {
      return NextResponse.json({ error: 'DB query failed', detail: countError.message }, { status: 500 })
    }

    // 4. project_id NULL 카운트
    const { count: nullProject } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)
      .is('project_id', null)

    // 5. project_id 있는 카운트
    const { count: withProject } = await supabase
      .from('daily_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', cid)
      .not('project_id', 'is', null)

    // 6. 최근 20건
    const { data: recent, error: recentError } = await supabase
      .from('daily_tasks')
      .select('id, date, title, status, project_id, created_by, created_at')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
      .limit(20)

    // 7. 날짜 범위 (가장 오래된 것)
    const { data: oldest } = await supabase
      .from('daily_tasks')
      .select('date')
      .eq('company_id', cid)
      .order('date', { ascending: true })
      .limit(1)

    // 8. 날짜 범위 (가장 최신 것)
    const { data: newest } = await supabase
      .from('daily_tasks')
      .select('date')
      .eq('company_id', cid)
      .order('date', { ascending: false })
      .limit(1)

    const totalCount = total ?? 0

    return NextResponse.json({
      status: 'ok',
      company_id: cid,
      role: profile.role,
      counts: {
        total: totalCount,
        nullProject: nullProject ?? 0,
        withProject: withProject ?? 0,
      },
      dateRange: {
        oldest: oldest?.[0]?.date ?? null,
        newest: newest?.[0]?.date ?? null,
      },
      recent: recent ?? [],
      recentError: recentError?.message ?? null,
      summary: totalCount === 0
        ? '⚠️ 업무일지 데이터가 전혀 없습니다.'
        : `✅ 총 ${totalCount}건 (현장연결: ${withProject ?? 0}건, 미연결: ${nullProject ?? 0}건)`,
    })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Unexpected error',
      detail: e?.message ?? String(e),
    }, { status: 500 })
  }
}
