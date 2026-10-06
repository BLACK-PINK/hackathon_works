'use client'

import { useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays,
  List, Calendar, User,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DailyTaskList } from '@/components/journal/DailyTaskList'
import { TaskCalendarView } from '@/components/journal/TaskCalendarView'
import { AddTaskSheet } from '@/components/journal/AddTaskSheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types'

type ViewMode = 'list' | 'calendar'

interface Props {
  profile: any
  initialDate?: string
  initialUserId?: string
}


export function TaskJournalPageClient({ profile, initialDate, initialUserId }: Props) {
  const supabase = createClient()
  const isOwnerOrManager = profile.role === 'owner' || profile.role === 'manager'

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate ? parseISO(initialDate) : new Date()
  )
  // 모바일 단일 멤버 선택
  const [viewUserId, setViewUserId] = useState<string>(initialUserId ?? profile.id)
  const [taskKey, setTaskKey] = useState(0)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const calendarRef = useRef<HTMLInputElement>(null)

  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const today = new Date()
  const isToday = dateStr === format(today, 'yyyy-MM-dd')

  // 멤버 목록
  const { data: members = [] } = useQuery({
    queryKey: ['members-for-filter', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('role')
      // 이름 기준 고정 순서: 김지원(좌상단) → 남유정(우상단) → 이**(좌하단) → 박**(우하단)
      const nameOrder: Record<string, number> = { '김지원': 0, '남유정': 1 }
      return (data || []).sort((a: any, b: any) => {
        // 1차: role 순서 (owner → manager → member/worker)
        const roleOrder: Record<string, number> = { owner: 0, manager: 1, worker: 2, member: 3 }
        const rDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
        if (rDiff !== 0) return rDiff
        // 2차: 이름 고정 순서가 있으면 그것을 우선
        const aNameOrder = nameOrder[a.name] ?? 99
        const bNameOrder = nameOrder[b.name] ?? 99
        if (aNameOrder !== bNameOrder) return aNameOrder - bNameOrder
        // 3차: 가입일 오름차순
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
      })
    },
    staleTime: 60_000,
  })

  const viewingMember = members.find((m: any) => m.id === viewUserId) || profile

  const handleCalendarDateSelect = (date: string) => {
    setSelectedDate(parseISO(date))
    setViewMode('list')
  }

  // PC에서는 표시할 멤버 수 결정 (최대 3열 그리드)
  // 자기 자신은 항상 포함, owner/manager면 전체, member면 자신만
  const displayMembers: any[] = useMemo(() => {
    if (isOwnerOrManager) return members
    return members.filter((m: any) => m.id === profile.id)
  }, [members, isOwnerOrManager, profile.id])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="업무일지"
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

      {/* ── 컨트롤 바 (날짜 네비 + 뷰 모드) */}
      <div className="bg-white border-b border-black/5 px-4 py-2 flex items-center justify-between gap-2">
        {/* 뷰 모드 토글 */}
        <div className="flex items-center bg-[#F2F2F7] rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all',
              viewMode === 'list' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#8E8E93]'
            )}
          >
            <List className="w-3.5 h-3.5" />
            목록
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all',
              viewMode === 'calendar' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#8E8E93]'
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

      {/* ── 모바일 멤버 탭 필터 (목록뷰 + 멤버 2명 이상) */}
      {viewMode === 'list' && members.length > 1 && (
        <div className="md:hidden bg-white border-b border-black/5 px-4 py-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {displayMembers.map((m: any) => {
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

      {/* ── 콘텐츠 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* 달력뷰 */}
        {viewMode === 'calendar' && (
          <TaskCalendarView
            profile={profile}
            members={members}
            onDateSelect={handleCalendarDateSelect}
          />
        )}

        {/* 목록뷰 — 모바일: 단일 멤버 */}
        {viewMode === 'list' && (
          <>
            {/* 모바일 */}
            <div className="md:hidden">
              <DailyTaskList
                key={`task-${taskKey}-${viewUserId}-${dateStr}`}
                date={dateStr}
                profile={profile}
                viewUserId={viewUserId}
                viewingMember={viewingMember}
                onAdd={() => setShowAddSheet(true)}
              />
            </div>

            {/* PC: 멤버별 3열 그리드 */}
            <div className="hidden md:block p-5">
              {displayMembers.length === 0 ? (
                <div className="ios-card p-8 text-center text-[#8E8E93]">멤버 정보가 없습니다</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                  {displayMembers.map((member: any) => (
                    <MemberTaskColumn
                      key={member.id}
                      member={member}
                      isSelf={member.id === profile.id}
                      date={dateStr}
                      profile={profile}
                      onAdd={member.id === profile.id ? () => setShowAddSheet(true) : undefined}
                      refreshKey={taskKey}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* AddTaskSheet */}
      <AddTaskSheet
        open={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onSuccess={() => { setShowAddSheet(false); setTaskKey(k => k + 1) }}
        date={dateStr}
        profile={profile}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// MemberTaskColumn: PC 그리드 1열 = 1명
// ─────────────────────────────────────────────
function MemberTaskColumn({
  member,
  isSelf,
  date,
  profile,
  onAdd,
  refreshKey,
}: {
  member: any
  isSelf: boolean
  date: string
  profile: any
  onAdd?: () => void
  refreshKey: number
}) {
  const roleLabel = ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
      {/* 멤버 헤더 */}
      <div className={cn(
        'px-4 py-3 border-b border-black/5 flex items-center justify-between',
        isSelf ? 'bg-[#007AFF]/8' : 'bg-[#F9F9FB]'
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
            isSelf ? 'bg-[#007AFF]' : 'bg-[#E5E5EA]'
          )}>
            <User className={cn('w-4 h-4', isSelf ? 'text-white' : 'text-[#8E8E93]')} />
          </div>
          <div>
            <p className={cn('text-[14px] font-semibold', isSelf ? 'text-[#007AFF]' : 'text-black')}>
              {member.name}
              {isSelf && <span className="ml-1 text-[11px] text-[#007AFF]/70 font-normal">나</span>}
            </p>
            <p className="text-[11px] text-[#8E8E93]">{roleLabel}</p>
          </div>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[#007AFF] text-[12px] font-medium active:opacity-60 px-2 py-1 rounded-lg bg-[#007AFF]/10"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
        )}
      </div>

      {/* 해당 멤버의 일지 내용 */}
      <div className="overflow-hidden">
        <DailyTaskList
          key={`pc-${refreshKey}-${member.id}-${date}`}
          date={date}
          profile={profile}
          viewUserId={member.id}
          viewingMember={member}
          onAdd={onAdd}
        />
      </div>
    </div>
  )
}
