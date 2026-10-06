'use client'

import { useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays,
  List, Calendar, MapPin,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SiteLogList } from '@/components/journal/SiteLogList'
import { SiteCalendarView } from '@/components/journal/SiteCalendarView'
import { AlertTriangle, ChevronDown, ChevronUp, Camera, ZoomIn, X, Pencil } from 'lucide-react'
import { AddSiteLogSheet } from '@/components/journal/AddSiteLogSheet'
import { EditProjectGroupSheet } from '@/components/journal/EditProjectGroupSheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { SiteGroup } from '@/components/journal/SiteLogList'

type ViewMode = 'list' | 'calendar'

interface Props {
  profile: any
  initialDate?: string
  initialProjectId?: string
}

export function SiteJournalPageClient({ profile, initialDate, initialProjectId }: Props) {
  const supabase = createClient()

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate ? parseISO(initialDate) : new Date()
  )
  const [siteKey, setSiteKey] = useState(0)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [editingGroup, setEditingGroup] = useState<SiteGroup | null>(null)
  const [focusProjectId] = useState<string | null>(initialProjectId ?? null)
  const calendarRef = useRef<HTMLInputElement>(null)

  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const today = new Date()
  const isToday = dateStr === format(today, 'yyyy-MM-dd')

  // 해당 날짜 현장일지 데이터 (PC 그리드용)
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['site-logs-pc', dateStr, profile.company_id, siteKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_logs')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('date', dateStr)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // 등록된 현장 목록 (active)
  const { data: activeProjects = [] } = useQuery({
    queryKey: ['projects-active', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      return data || []
    },
    staleTime: 60_000,
  })

  // 현장별 그룹핑 (PC 그리드)
  const projectGroups = useMemo(() => {
    const map = new Map<string, { project: any; logs: any[] }>()
    // 먼저 등록된 현장을 기준으로 틀을 잡음
    for (const p of activeProjects) {
      map.set(p.id, { project: p, logs: [] })
    }
    // 로그를 현장별로 분배
    for (const log of logs) {
      const key = log.project_id ?? '__none__'
      if (log.project_id && map.has(log.project_id)) {
        map.get(log.project_id)!.logs.push(log)
      } else if (!log.project_id) {
        if (!map.has('__none__')) {
          map.set('__none__', { project: { id: '__none__', name: '현장 미지정' }, logs: [] })
        }
        map.get('__none__')!.logs.push(log)
      }
    }
    return Array.from(map.values())
  }, [activeProjects, logs])

  const handleCalendarDateSelect = (date: string) => {
    setSelectedDate(parseISO(date))
    setViewMode('list')
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="현장일지"
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

      {/* ── 컨트롤 바 */}
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

        {/* 날짜 네비게이션 */}
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

      {/* ── 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* 달력뷰 */}
        {viewMode === 'calendar' && (
          <SiteCalendarView
            profile={profile}
            onDateSelect={handleCalendarDateSelect}
          />
        )}

        {/* 목록뷰 */}
        {viewMode === 'list' && (
          <>
            {/* 모바일: 기존 단일 리스트 */}
            <div className="md:hidden">
              <SiteLogList
                key={`site-${siteKey}-${dateStr}`}
                date={dateStr}
                profile={profile}
                onAdd={() => setShowAddSheet(true)}
                onEditGroup={(group) => setEditingGroup(group)}
                focusProjectId={focusProjectId}
              />
            </div>

            {/* PC: 현장별 3열 그리드 */}
            <div className="hidden md:block p-5">
              {isLoading ? (
                <div className="grid grid-cols-3 gap-5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-2xl p-4 animate-pulse shadow-sm border border-black/5">
                      <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                      <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : projectGroups.length === 0 ? (
                <div className="ios-card p-10 text-center">
                  <p className="text-[32px] mb-2">🏗️</p>
                  <p className="text-[15px] font-medium text-black">등록된 현장이 없습니다</p>
                  <p className="text-[13px] text-[#8E8E93] mt-1">현장을 먼저 등록해주세요</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
                  {projectGroups.map(({ project, logs: projectLogs }) => (
                    <SiteProjectColumn
                      key={project.id}
                      project={project}
                      logs={projectLogs}
                      date={dateStr}
                      profile={profile}
                      onAdd={() => setShowAddSheet(true)}
                      onEditGroup={(group) => setEditingGroup(group)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Sheets */}
      <AddSiteLogSheet
        open={showAddSheet}
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

// ─────────────────────────────────────────────
// SiteProjectColumn: PC 그리드 1열 = 1개 현장
// SiteLogList 재사용 X → 카드 폭 안에서 직접 렌더
// ─────────────────────────────────────────────
function SiteProjectColumn({
  project,
  logs,
  onAdd,
  onEditGroup,
}: {
  project: any
  logs: any[]
  date: string
  profile: any
  onAdd: () => void
  onEditGroup: (group: SiteGroup) => void
}) {
  const isEmpty = logs.length === 0
  const allPhotoUrls: string[] = logs.flatMap((l: any) =>
    Array.isArray(l.photo_urls) ? l.photo_urls : []
  )
  const group: SiteGroup = {
    projectId: project.id === '__none__' ? null : project.id,
    projectName: project.name,
    weather: logs[0]?.weather ?? '',
    creatorId: logs[0]?.created_by ?? '',
    logs,
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
      {/* ── 현장 헤더 */}
      <div className="px-4 py-3 border-b border-black/5 bg-[#FF9500]/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[#FF9500]/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 text-[#FF9500]" />
          </div>
          {/* truncate로 카드 폭 초과 방지 */}
          <p className="text-[13px] font-semibold text-[#3C3C43] truncate">{project.name}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isEmpty && (
            <span className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full whitespace-nowrap">
              공정 {logs.length}개
            </span>
          )}
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[#007AFF] text-[12px] font-medium active:opacity-60 px-2 py-1 rounded-lg bg-[#007AFF]/10 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            작성
          </button>
        </div>
      </div>

      {/* ── 콘텐츠 */}
      {isEmpty ? (
        <div className="p-6 text-center">
          <p className="text-[13px] text-[#8E8E93]">오늘 현장일지가 없습니다</p>
          <button
            onClick={onAdd}
            className="mt-3 px-4 py-1.5 bg-[#007AFF] text-white text-[12px] font-medium rounded-xl active:opacity-70"
          >
            작성하기
          </button>
        </div>
      ) : (
        <>
          {/* 날씨 + 수정 버튼 */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {group.weather && (
                <span className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full">
                  {group.weather}
                </span>
              )}
            </div>
            {onEditGroup && (
              <button
                onClick={() => onEditGroup(group)}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-medium active:opacity-60 flex-shrink-0"
              >
                <Pencil className="w-3 h-3" />
                수정
              </button>
            )}
          </div>

          {/* 공정 목록 — WorkRow 직접 렌더 */}
          <div className="divide-y divide-black/[0.04]">
            {logs.map((log, idx) => (
              <PCWorkRow key={log.id} log={log} index={idx} />
            ))}
          </div>

          {/* 현장 사진 */}
          {allPhotoUrls.length > 0 && (
            <div className="px-4 py-3 border-t border-black/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Camera className="w-3.5 h-3.5 text-[#8E8E93]" />
                <span className="text-[11px] font-medium text-[#8E8E93]">현장 사진 {allPhotoUrls.length}장</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {allPhotoUrls.map((url, i) => (
                  <PCPhotoThumb key={i} url={url} />
                ))}
              </div>
            </div>
          )}

          {/* 등록 시각 */}
          <p className="text-[11px] text-[#C7C7CC] px-4 pb-3 pt-1">
            {new Date(logs[logs.length - 1].created_at).toLocaleString('ko-KR', {
              month: 'numeric', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })} 등록
          </p>
        </>
      )}
    </div>
  )
}

// PC 카드 전용 WorkRow — 카드 폭에 맞는 텍스트 처리
function PCWorkRow({ log, index }: { log: any; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div
        className="flex items-start gap-2.5 px-4 py-3 cursor-pointer active:bg-black/[0.02] select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 번호 */}
        <span className="w-5 h-5 rounded-full bg-[#34C759] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </span>

        {/* 내용 — min-w-0 으로 flex 자식이 카드 폭을 초과하지 않게 */}
        <div className="flex-1 min-w-0">
          {log.process && (
            <span className="inline-block text-[11px] font-semibold text-[#34C759] mb-0.5">
              {log.process}
            </span>
          )}
          {/* break-words 로 긴 단어도 줄바꿈 */}
          <p className="text-[13px] text-black leading-snug break-words whitespace-pre-wrap">
            {log.work_content}
          </p>
          {(log.workers_count > 0 || log.worker_names) && (
            <p className="text-[11px] text-[#8E8E93] mt-0.5 truncate">
              {log.workers_count > 0 ? `${log.workers_count}명` : ''}
              {log.worker_names ? ` · ${log.worker_names}` : ''}
            </p>
          )}
        </div>

        {expanded
          ? <ChevronUp className="w-4 h-4 text-[#C7C7CC] flex-shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-[#C7C7CC] flex-shrink-0 mt-0.5" />
        }
      </div>

      {expanded && log.special_notes && (
        <div className="px-4 pb-3 pt-2 bg-[#F9F9FB] border-t border-black/[0.04]">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-[#FF3B30] leading-relaxed break-words">{log.special_notes}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// PC 카드 전용 PhotoThumb
function PCPhotoThumb({ url }: { url: string }) {
  const [lightbox, setLightbox] = useState(false)
  return (
    <>
      <button
        onClick={() => setLightbox(true)}
        className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-[#F2F2F7] active:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="현장 사진" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/20 transition-opacity">
          <ZoomIn className="w-4 h-4 text-white" />
        </div>
      </button>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white"
            onClick={() => setLightbox(false)}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="현장 사진"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
