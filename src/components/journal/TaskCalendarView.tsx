'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface TaskCalendarViewProps {
  profile: any
  members: any[]                          // 전체 멤버 목록
  onDateSelect: (date: string) => void    // 날짜 클릭 → 목록뷰로 이동
}

export function TaskCalendarView({ profile, members, onDateSelect }: TaskCalendarViewProps) {
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')

  // ── 해당 월 전체 업무일지 작성 현황 조회
  // created_by + date 조합으로 "누가 어떤 날 썼는지" 파악
  const { data: taskRows = [], isLoading } = useQuery({
    queryKey: ['task-calendar', profile.company_id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('created_by, date')
        .eq('company_id', profile.company_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })

  // ── 해당 월 대표 확인 현황
  const { data: reviewRows = [] } = useQuery({
    queryKey: ['task-reviews-calendar', profile.company_id, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_task_reviews')
        .select('target_user_id, date, is_confirmed')
        .eq('company_id', profile.company_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
      return data || []
    },
    staleTime: 30_000,
    retry: false,
  })

  // ── date → 작성한 멤버 이름 배열 맵
  const writerMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    // 같은 날 같은 사람이 여러 row → 중복 제거
    const seen = new Set<string>()
    for (const row of taskRows) {
      const key = `${row.date}__${row.created_by}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!map[row.date]) map[row.date] = []
      const member = members.find(m => m.id === row.created_by)
      if (member) map[row.date].push(member.name)
    }
    return map
  }, [taskRows, members])

  // ── date → 확인 완료된 target_user_id Set 맵
  const confirmedMap = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const row of reviewRows) {
      if (!row.is_confirmed) continue
      if (!map[row.date]) map[row.date] = new Set()
      map[row.date].add(row.target_user_id)
    }
    return map
  }, [reviewRows])

  // ── 달력 날짜 배열 생성
  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  // 첫째날 요일 오프셋 (일요일 시작: 일=0, 월=1 ... 토=6)
  const firstDayOfWeek = getDay(days[0])  // 0=일 ~ 6=토
  const totalCells = Math.ceil((days.length + firstDayOfWeek) / 7) * 7

  const today = format(new Date(), 'yyyy-MM-dd')
  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="flex flex-col h-full">
      {/* 월 네비게이션 */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-black/5">
        <button
          onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          className="w-9 h-9 flex items-center justify-center text-[#007AFF] active:opacity-60 rounded-xl"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="text-[17px] font-bold text-black">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </p>
        <button
          onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          className="w-9 h-9 flex items-center justify-center text-[#007AFF] active:opacity-60 rounded-xl"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 달력 */}
      <div className="flex-1 overflow-y-auto bg-[#F2F2F7] p-3">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={cn(
              'text-center text-[11px] font-semibold py-1',
              i === 0 ? 'text-[#FF3B30]' : i === 6 ? 'text-[#007AFF]' : 'text-[#8E8E93]'
            )}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 그리드 */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayIdx = idx - firstDayOfWeek
            const day = dayIdx >= 0 && dayIdx < days.length ? days[dayIdx] : null
            if (!day) return <div key={idx} />

            const dateStr = format(day, 'yyyy-MM-dd')
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isTodayDate = dateStr === today
            const writers = writerMap[dateStr] || []
            const confirmed = confirmedMap[dateStr]
            // 이 날 작성한 멤버 중 모두 확인됐는지
            const writersSet = new Set(
              taskRows
                .filter(r => r.date === dateStr)
                .map(r => r.created_by)
            )
            const allConfirmed = writers.length > 0 &&
              [...writersSet].every(uid => confirmed?.has(uid))

            const dayOfWeek = getDay(day) // 0=일, 6=토
            const isSat = dayOfWeek === 6
            const isSun = dayOfWeek === 0
            // 미래 날짜는 흐리게
            const isFuture = dateStr > today

            return (
              <button
                key={dateStr}
                onClick={() => !isFuture && onDateSelect(dateStr)}
                disabled={isFuture}
                className={cn(
                  'rounded-2xl p-1.5 min-h-[72px] flex flex-col text-left transition-all',
                  'bg-white shadow-sm',
                  isTodayDate && 'ring-2 ring-[#007AFF]',
                  isFuture && 'opacity-30 cursor-default',
                  !isFuture && 'active:scale-95'
                )}
              >
                {/* 날짜 숫자 */}
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    'text-[12px] font-bold leading-none',
                    isTodayDate ? 'text-[#007AFF]' :
                    isSat ? 'text-[#007AFF]' :
                    isSun ? 'text-[#FF3B30]' :
                    'text-[#3C3C43]'
                  )}>
                    {format(day, 'd')}
                  </span>
                  {/* 전원 확인 뱃지 */}
                  {allConfirmed && (
                    <CheckCircle2 className="w-3 h-3 text-[#34C759] flex-shrink-0" />
                  )}
                </div>

                {/* 작성자 이름 뱃지 */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {writers.slice(0, 4).map((name, i) => {
                    // 이 멤버가 확인됐는지
                    const uid = members.find(m => m.name === name)?.id
                    const isConfirmed = uid ? confirmed?.has(uid) : false
                    return (
                      <span
                        key={i}
                        className={cn(
                          'text-[9px] font-semibold px-1 py-0.5 rounded-md leading-tight truncate',
                          isConfirmed
                            ? 'bg-[#34C759]/15 text-[#34C759]'
                            : 'bg-[#007AFF]/10 text-[#007AFF]'
                        )}
                      >
                        {name}
                      </span>
                    )
                  })}
                  {writers.length > 4 && (
                    <span className="text-[8px] text-[#8E8E93] pl-1">
                      +{writers.length - 4}명
                    </span>
                  )}
                  {/* 아무도 안 썼을 때 */}
                  {writers.length === 0 && !isFuture && (
                    <span className="text-[9px] text-[#C7C7CC] pl-0.5">-</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* 범례 */}
        <div className="mt-3 flex items-center gap-3 px-1">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-[#007AFF]/10 text-[#007AFF]">이름</span>
            <span className="text-[10px] text-[#8E8E93]">작성</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-[#34C759]/15 text-[#34C759]">이름</span>
            <span className="text-[10px] text-[#8E8E93]">확인 완료</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
            <span className="text-[10px] text-[#8E8E93]">전원 확인</span>
          </div>
        </div>
      </div>
    </div>
  )
}
