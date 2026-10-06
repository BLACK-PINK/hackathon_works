'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameMonth,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface SiteCalendarViewProps {
  profile: any
  onDateSelect: (date: string) => void  // 날짜 클릭 → 목록뷰로 이동
}

export function SiteCalendarView({ profile, onDateSelect }: SiteCalendarViewProps) {
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')

  // ── 해당 월 현장일지 조회 (현장명 포함)
  const { data: siteRows = [], isLoading } = useQuery({
    queryKey: ['site-calendar', profile.company_id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_logs')
        .select('date, project_id, projects(id, name)')
        .eq('company_id', profile.company_id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })

  // ── date → 현장명 배열 맵 (중복 제거)
  const projectMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    const seen = new Set<string>()
    for (const row of siteRows) {
      const projectName = (row.projects as any)?.name ?? '미지정'
      const key = `${row.date}__${row.project_id ?? 'none'}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!map[row.date]) map[row.date] = []
      map[row.date].push(projectName)
    }
    return map
  }, [siteRows])

  // ── 달력 날짜 배열
  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  // 일요일 시작 (0=일 ~ 6=토)
  const firstDayOfWeek = getDay(days[0])
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
            const isTodayDate = dateStr === today
            const isFuture = dateStr > today
            const projects = projectMap[dateStr] || []

            const dayOfWeek = getDay(day) // 0=일, 6=토
            const isSat = dayOfWeek === 6
            const isSun = dayOfWeek === 0

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
                <span className={cn(
                  'text-[12px] font-bold leading-none mb-1',
                  isTodayDate ? 'text-[#007AFF]' :
                  isSat ? 'text-[#007AFF]' :
                  isSun ? 'text-[#FF3B30]' :
                  'text-[#3C3C43]'
                )}>
                  {format(day, 'd')}
                </span>

                {/* 현장명 뱃지 */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {projects.slice(0, 3).map((name, i) => (
                    <span
                      key={i}
                      className="text-[9px] font-semibold px-1 py-0.5 rounded-md leading-tight truncate bg-[#FF9500]/12 text-[#FF9500]"
                    >
                      {name}
                    </span>
                  ))}
                  {projects.length > 3 && (
                    <span className="text-[8px] text-[#8E8E93] pl-1">
                      +{projects.length - 3}건
                    </span>
                  )}
                  {projects.length === 0 && !isFuture && (
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
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-[#FF9500]/12 text-[#FF9500]">현장명</span>
            <span className="text-[10px] text-[#8E8E93]">현장일지 작성</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[#C7C7CC]">-</span>
            <span className="text-[10px] text-[#8E8E93]">미작성</span>
          </div>
        </div>
      </div>
    </div>
  )
}
