import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/BottomNav'
import { SideNav } from '@/components/layout/SideNav'
import { createClient } from '@/lib/supabase/server'
import { PendingApprovalScreen } from '@/components/auth/PendingApprovalScreen'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let role: string | undefined
  let isPending = false
  let companyName: string | undefined
  let userName: string | undefined

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, is_active, company_id, name, company:companies(name)')
        .eq('id', user.id)
        .single()

      if (profile) {
        role        = profile.role ?? undefined
        userName    = profile.name ?? undefined
        companyName = (profile.company as any)?.name ?? undefined
        if (profile.company_id && profile.is_active === false) {
          isPending = true
        }
      }
    }
  } catch {
    // 오류 시 role 없이 렌더링
  }

  if (isPending) {
    return <PendingApprovalScreen />
  }

  return (
    <div className="h-dvh bg-[#F2F2F7] flex overflow-hidden">

      {/* ── PC 사이드바 (md 이상) ── */}
      <SideNav role={role} companyName={companyName} userName={userName} />

      {/* ── 콘텐츠 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="
          flex-1 min-h-0
          overflow-y-auto
          pb-[80px] md:pb-0
        ">
          {children}
        </main>

        {/* ── 모바일 바텀탭 (md 미만만 표시) ── */}
        <div className="md:hidden">
          <BottomNav role={role} />
        </div>
      </div>

    </div>
  )
}
