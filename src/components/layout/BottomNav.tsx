'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
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
  { id: 'dashboard', label: '홈',      href: '/dashboard' },
  { id: 'task',      label: '업무일지', href: '/journal/task' },
  { id: 'site',      label: '현장일지', href: '/journal/site' },
  { id: 'scheduler', label: '스케줄',  href: '/scheduler' },
  { id: 'orders',    label: '전달',    href: '/orders' },
  { id: 'as',        label: 'A/S',    href: '/as' },
  { id: 'projects',  label: '현장',   href: '/projects' },
  { id: 'finance',   label: '재무',   href: '/finance' },
  { id: 'search',    label: '검색',   href: '/search' },
  { id: 'vendors',   label: '거래처', href: '/vendors' },
  { id: 'profile',   label: '내정보', href: '/profile' },
]

const MEMBERS_TAB: TabItem = { id: 'members', label: '멤버', href: '/members' }

interface BottomNavProps {
  unconfirmedCount?: number
  role?: string
}

export function BottomNav({ unconfirmedCount = 0, role }: BottomNavProps) {
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

  return (
    <>
      {/* 로그아웃 확인 다이얼로그 */}
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogout(false)} />
          <div className="relative w-full max-w-sm mx-4 mb-8 bg-white rounded-2xl overflow-hidden shadow-xl border border-[#E2E5EB]">
            <div className="px-5 py-5 text-center border-b border-[#E2E5EB]">
              <p className="text-[17px] font-semibold text-[#111827]">로그아웃</p>
              <p className="text-[14px] text-[#6B7280] mt-1">정말 로그아웃 하시겠습니까?</p>
            </div>
            <div className="flex">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 py-4 text-[15px] text-[#4B5563] border-r border-[#E2E5EB] active:bg-[#F4F5F7]"
              >취소</button>
              <button
                onClick={handleLogout}
                className="flex-1 py-4 text-[15px] font-semibold text-[#C53030] active:bg-[#FFF5F5]"
              >로그아웃</button>
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <div
          className="flex items-center h-[56px] px-1 overflow-x-auto scrollbar-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
            return (
              <Link
                key={tab.id}
                href={tab.href}
                prefetch={true}
                className={cn(
                  'relative flex items-center justify-center px-3 py-1.5 rounded-lg flex-shrink-0 transition-all duration-150',
                  isActive
                    ? 'bg-[#EEF2FF]'
                    : 'active:bg-[#F4F5F7]'
                )}
              >
                <span className={cn(
                  'text-[12px] font-semibold whitespace-nowrap leading-none',
                  isActive ? 'text-[#1B4FD8]' : 'text-[#9CA3AF]'
                )}>
                  {tab.label}
                </span>
                {/* 활성 언더바 */}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#1B4FD8]" />
                )}
                {/* 알림 뱃지 */}
                {tab.id === 'orders' && unconfirmedCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 badge-red text-[10px] min-w-[16px] h-[16px]">
                    {unconfirmedCount > 99 ? '99+' : unconfirmedCount}
                  </span>
                )}
              </Link>
            )
          })}

          {/* 새로고침 */}
          <button
            onClick={handleRefresh}
            className="flex items-center justify-center px-3 py-1.5 rounded-lg flex-shrink-0 active:bg-[#F4F5F7]"
          >
            <RefreshCw className={cn(
              'w-4 h-4 text-[#9CA3AF] transition-transform duration-700',
              spinning && 'animate-spin'
            )} />
          </button>

          {/* 로그아웃 */}
          <button
            onClick={() => setShowLogout(true)}
            className="flex items-center justify-center px-3 py-1.5 rounded-lg flex-shrink-0 active:bg-[#FFF5F5]"
          >
            <LogOut className="w-4 h-4 text-[#9CA3AF]" />
          </button>
        </div>
      </nav>
    </>
  )
}
