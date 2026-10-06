'use client'

import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { RefreshCw, LogOut } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface TabItem {
  id: string
  label: string
  href: string
}

const BASE_TABS: TabItem[] = [
  { id: 'dashboard',  label: '홈',      href: '/dashboard' },
  { id: 'task',       label: '업무일지', href: '/journal/task' },
  { id: 'site',       label: '현장일지', href: '/journal/site' },
  { id: 'scheduler',  label: '스케줄',  href: '/scheduler' },
  { id: 'orders',     label: '업무전달', href: '/orders' },
  { id: 'as',         label: 'A/S',     href: '/as' },
  { id: 'projects',   label: '현장',    href: '/projects' },
  { id: 'finance',    label: '재무',    href: '/finance' },
  { id: 'search',     label: '검색',    href: '/search' },
  { id: 'vendors',    label: '거래처',  href: '/vendors' },
  { id: 'profile',    label: '내정보',  href: '/profile' },
]

const MEMBERS_TAB: TabItem = { id: 'members', label: '멤버', href: '/members' }

interface SideNavProps {
  role?: string
  companyName?: string
  userName?: string
}

export function SideNav({ role, companyName, userName }: SideNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [spinning, setSpinning] = useState(false)
  const [showLogout, setShowLogout] = useState(false)

  const tabs: TabItem[] = (role === 'owner' || role === 'manager')
    ? [...BASE_TABS, MEMBERS_TAB]
    : BASE_TABS

  const handleRefresh = async () => {
    if (spinning) return
    setSpinning(true)
    await supabase.auth.refreshSession()
    router.refresh()
    setTimeout(() => setSpinning(false), 800)
  }

  const handleLogout = async () => {
    setShowLogout(false)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = (r?: string) => {
    if (r === 'owner')   return '대표'
    if (r === 'manager') return '팀장'
    return '멤버'
  }

  return (
    <>
      {/* 로그아웃 확인 모달 */}
      {showLogout && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogout(false)} />
          <div className="relative w-80 bg-white rounded-2xl overflow-hidden shadow-xl border border-[#E2E5EB]">
            <div className="px-5 py-5 text-center border-b border-[#E2E5EB]">
              <p className="text-[17px] font-semibold text-[#111827]">로그아웃</p>
              <p className="text-[14px] text-[#6B7280] mt-1">정말 로그아웃 하시겠습니까?</p>
            </div>
            <div className="flex">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 py-4 text-[15px] text-[#4B5563] border-r border-[#E2E5EB] hover:bg-[#F4F5F7] transition-colors"
              >취소</button>
              <button
                onClick={handleLogout}
                className="flex-1 py-4 text-[15px] font-semibold text-[#C53030] hover:bg-[#FFF5F5] transition-colors"
              >로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {/* 사이드바 */}
      <aside className="
        hidden md:flex flex-col
        w-[200px] flex-shrink-0
        h-dvh sticky top-0
        bg-[#141B2D]
        border-r border-white/5
        overflow-y-auto
      ">
        {/* 회사명 / 유저 */}
        <div className="px-5 pt-6 pb-5 border-b border-white/8">
          <p className="text-[14px] font-bold text-white truncate leading-snug">
            {companyName || '(주)챕터디자인'}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D7F6C] flex-shrink-0" />
            <p className="text-[12px] text-white/40 truncate">
              {userName} · {roleLabel(role)}
            </p>
          </div>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
            return (
              <button
                key={tab.id}
                onClick={() => router.push(tab.href)}
                className={cn(
                  'w-full text-left px-3.5 py-2.5 rounded-lg transition-all duration-150 text-[14px] font-medium',
                  isActive
                    ? 'bg-[#1B4FD8] text-white'
                    : 'text-[#8B95A8] hover:bg-white/6 hover:text-white'
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* 하단 */}
        <div className="px-3 pb-5 pt-2 border-t border-white/8 space-y-0.5">
          <button
            onClick={handleRefresh}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[#8B95A8] hover:bg-white/6 hover:text-white transition-all text-[14px] font-medium"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 flex-shrink-0', spinning && 'animate-spin')} />
            새로고침
          </button>
          <button
            onClick={() => setShowLogout(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[#8B95A8] hover:bg-[#C53030]/15 hover:text-[#FDA4AF] transition-all text-[14px] font-medium"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  )
}
