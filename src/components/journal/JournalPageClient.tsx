'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List, Calendar } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DailyTaskList } from '@/components/journal/DailyTaskList'
import { SiteLogList } from '@/components/journal/SiteLogList'
import { TaskCalendarView } from '@/components/journal/TaskCalendarView'
import { SiteCalendarView } from '@/components/journal/SiteCalendarView'
import { AddTaskSheet } from '@/components/journal/AddTaskSheet'
import { AddSiteLogSheet } from '@/components/journal/AddSiteLogSheet'
import { EditProjectGroupSheet } from '@/components/journal/EditProjectGroupSheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types'

type TabType = 'task' | 'site'
type ViewMode = 'list' | 'calendar'

interface JournalPageClientProps {
  profile: any
  initialTab?: TabType
  initialDate?: string
  initialUserId?: string
  initialProjectId?: string
}

export function JournalPageClient({
  profile,
  initialTab = 'task',
  initialDate,
  initialUserId,
  initialProjectId,
}: JournalPageClientProps) {
  const supabase = createClient()
  const isOwner = profile.role === 'owner'

  // ── 메인 탭 (업무일지 / 현장일지)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  // ── 뷰 모드 (목록 / 달력) — 탭별로 독립
  const [taskViewMode, setTaskViewMode] = useState<ViewMode>('list')
  const [siteViewMode, setSiteViewMode] = useState<ViewMode>('list')

  // ── 날짜 (목록뷰용)
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate ? parseISO(initialDate) : new Date()
  )

  // ── 멤버 필터
  const [viewUserId, setViewUserId] = useState<string>(initialUserId ?? profile.id)

  // ── 현장 필터 (대시보드에서 진입 시)
  const [focusProjectId, setFocusProjectId] = useState<string | null>(initialProjectId ?? null)

  // ── 리프레시 키
  const [taskKey, setTaskKey] = useState(0)
  const [siteKey, setSiteKey] = useState(0)

  const [showAddSheet, setShowAddSheet] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any | null>(null)

  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const today = new Date()
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  const calendarRef = useRef<HTMLInputElement>(null)

  // ── 현재 탭의 뷰 모드
  const viewMode = activeTab === 'task' ? taskViewMode : siteViewMode
  const setViewMode = (m: ViewMode) => {
    if (activeTab === 'task') setTaskViewMode(m)
    else setSiteViewMode(m)
  }

  // ── 멤버 목록
  const { data: members = [] } = useQuery({
    queryKey: ['members-for-filter', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('role')
      return data || []
    },
    staleTime: 60_000,
  })

  const viewingMember = members.find((m: any) => m.id === viewUserId) || profile

  // ── 달력뷰에서 날짜 클릭 → 목록뷰로 전환
  const handleCalendarDateSelect = (date: string) => {
    setSelectedDate(parseISO(date))
    setViewMode('list')
  }

  const tabs = [
    { id: 'task' as TabType, label: '업무일지' },
    { id: 'site' as TabType, label: '현장일지' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="일지"
        action={
          viewMode === 'list' ? (
            <button
              onClick={() => setShowAddSheet(true)}
              className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
            >
              <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          ) : undefined
        }
      />

      {/* ── 메인 탭 (업무일지 / 현장일지) */}
      <div className="bg-white border-b border-black/5">
        <div className="flex px-4 pt-2 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 py-2 text-[14px] font-medium transition-colors border-b-2',
                activeTab === tab.id
                  ? 'text-[#007AFF] border-[#007AFF]'
                  : 'text-[#8E8E93] border-transparent'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 목록뷰/달력뷰 서브 컨트롤 바 */}
      <div className="bg-white border-b border-black/5 px-4 py-2 flex items-center justify-between gap-2">
        {/* 뷰 모드 토글 */}
        <div className="flex items-center bg-[#F2F2F7] rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all',
              viewMode === 'list'
                ? 'bg-white text-[#007AFF] shadow-sm'
                : 'text-[#8E8E93]'
            )}
          >
            <List className="w-3.5 h-3.5" />
            목록
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all',
              viewMode === 'calendar'
                ? 'bg-white text-[#007AFF] shadow-sm'
                : 'text-[#8E8E93]'
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            달력
          </button>
        </div>

        {/* 날짜 네비게이션 — 목록뷰일 때만 */}
        {viewMode === 'list' && (
          <div className="flex items-center gap-1 flex-1 justify-end">
            <button
              onClick={() => setSelectedDate(subDays(selectedDate, 1))}
              className="w-7 h-7 flex items-center justify-center text-[#007AFF] active:opacity-60"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => setSelectedDate(today)}
                className="text-[13px] font-semibold text-black whitespace-nowrap"
              >
                {format(selectedDate, 'M/d (EEE)', { locale: ko })}
                {isToday && <span className="ml-1 text-[11px] text-[#007AFF]">오늘</span>}
              </button>
              <button
                onClick={() => calendarRef.current?.showPicker?.()}
                className="text-[#007AFF] active:opacity-60 p-0.5"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
              <input
                ref={calendarRef}
                type="date"
                value={dateStr}
                onChange={(e) => { if (e.target.value) setSelectedDate(parseISO(e.target.value)) }}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
              />
            </div>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="w-7 h-7 flex items-center justify-center text-[#007AFF] active:opacity-60"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── 멤버 필터 스크롤 — 업무일지 목록뷰일 때만 */}
      {activeTab === 'task' && viewMode === 'list' && members.length > 1 && (
        <div className="bg-white border-b border-black/5 px-4 py-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {members.map((m: any) => {
              const isSelf = m.id === profile.id
              const isSelected = m.id === viewUserId
              return (
                <button
                  key={m.id}
                  onClick={() => { setViewUserId(m.id); setTaskKey(k => k + 1) }}
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all',
                    isSelected ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
                  )}
                >
                  <span className="text-[12px] font-semibold leading-tight">
                    {m.name}
                    {isSelf && (
                      <span className={cn('ml-1 text-[10px] font-normal', isSelected ? 'text-white/70' : 'text-[#007AFF]')}>나</span>
                    )}
                  </span>
                  <span className={cn('text-[10px]', isSelected ? 'text-white/70' : 'text-[#8E8E93]')}>
                    {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 현장 필터 배너 */}
      {activeTab === 'site' && viewMode === 'list' && focusProjectId && (
        <div className="bg-[#007AFF]/10 px-4 py-2 flex items-center justify-between">
          <p className="text-[12px] text-[#007AFF] font-medium">특정 현장 필터 적용 중</p>
          <button
            onClick={() => setFocusProjectId(null)}
            className="text-[11px] text-[#007AFF] font-semibold px-2 py-0.5 rounded-full bg-[#007AFF]/15 active:opacity-60"
          >
            전체 보기 ✕
          </button>
        </div>
      )}

      {/* ── 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto">

        {/* 업무일지 목록뷰 */}
        {activeTab === 'task' && viewMode === 'list' && (
          <DailyTaskList
            key={`task-${taskKey}-${viewUserId}-${dateStr}`}
            date={dateStr}
            profile={profile}
            viewUserId={viewUserId}
            viewingMember={viewingMember}
            onAdd={() => setShowAddSheet(true)}
          />
        )}

        {/* 업무일지 달력뷰 */}
        {activeTab === 'task' && viewMode === 'calendar' && (
          <TaskCalendarView
            profile={profile}
            members={members}
            onDateSelect={handleCalendarDateSelect}
          />
        )}

        {/* 현장일지 목록뷰 */}
        {activeTab === 'site' && viewMode === 'list' && (
          <SiteLogList
            key={`site-${siteKey}-${dateStr}`}
            date={dateStr}
            profile={profile}
            onAdd={() => setShowAddSheet(true)}
            onEditGroup={(group) => setEditingGroup(group)}
            focusProjectId={focusProjectId}
          />
        )}

        {/* 현장일지 달력뷰 */}
        {activeTab === 'site' && viewMode === 'calendar' && (
          <SiteCalendarView
            profile={profile}
            onDateSelect={handleCalendarDateSelect}
          />
        )}
      </div>

      {/* ── Sheets */}
      <AddTaskSheet
        open={showAddSheet && activeTab === 'task'}
        onClose={() => setShowAddSheet(false)}
        onSuccess={() => { setShowAddSheet(false); setTaskKey(k => k + 1) }}
        date={dateStr}
        profile={profile}
      />
      <AddSiteLogSheet
        open={showAddSheet && activeTab === 'site'}
        onClose={() => setShowAddSheet(false)}
        onSuccess={() => { setShowAddSheet(false); setSiteKey(k => k + 1) }}
        date={dateStr}
        profile={profile}
      />
      <EditProjectGroupSheet
        open={!!editingGroup}
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSuccess={() => setSiteKey(k => k + 1)}
        profile={profile}
      />
    </div>
  )
}
