'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, ChevronDown, ChevronUp,
  AlertTriangle, Pencil, Camera, X, ZoomIn,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SiteLogListProps {
  date: string
  profile: any
  onAdd?: () => void
  onEditGroup?: (group: SiteGroup) => void   // 현장 그룹 전체 편집
  focusProjectId?: string | null             // 대시보드에서 특정 현장으로 바로 이동
}

// ─── 현장별 그룹 타입
export interface SiteGroup {
  projectId: string | null
  projectName: string
  weather: string
  creatorId: string
  logs: any[]          // 같은 현장·같은 날 여러 row
}

/** 현장 ID 기준으로 로그를 묶는다 */
function groupByProject(logs: any[]): SiteGroup[] {
  const map = new Map<string, SiteGroup>()

  for (const log of logs) {
    const key = log.project_id ?? '__none__'
    if (!map.has(key)) {
      map.set(key, {
        projectId: log.project_id ?? null,
        projectName: log.projects?.name ?? '현장 미지정',
        weather: log.weather ?? '',
        creatorId: log.created_by,
        logs: [],
      })
    }
    map.get(key)!.logs.push(log)
  }

  // 현장 있는 것 먼저, 미지정 마지막
  return Array.from(map.values()).sort((a, b) => {
    if (a.projectId === null) return 1
    if (b.projectId === null) return -1
    return a.projectName.localeCompare(b.projectName, 'ko')
  })
}

// ═══════════════════════════════════════
// SiteLogList (메인)
// ═══════════════════════════════════════
export function SiteLogList({ date, profile, onAdd, onEditGroup, focusProjectId }: SiteLogListProps) {
  const supabase = createClient()

  const { data: memberMap = {} } = useQuery({
    queryKey: ['member-map', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('company_id', profile.company_id)
      const map: Record<string, string> = {}
      for (const m of data || []) map[m.id] = m.name
      return map
    },
    staleTime: 60_000,
  })

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['site-logs', date, profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_logs')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('date', date)
        .order('created_at', { ascending: true })   // 오래된 것 먼저 → 공정 순서 유지
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="ios-card p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const allGroups = groupByProject(logs)
  // focusProjectId가 있으면 해당 현장만 표시, 없으면 전체
  const groups = focusProjectId
    ? allGroups.filter(g => g.projectId === focusProjectId)
    : allGroups
  // 현장 수 기준으로 헤더 카운터
  const totalLogs = logs.length

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
          현장일지 ({totalLogs})
        </p>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[#007AFF] text-[13px] font-medium active:opacity-60"
          >
            <Plus className="w-4 h-4" />
            작성
          </button>
        )}
      </div>

      {/* 빈 상태 */}
      {logs.length === 0 ? (
        <div className="ios-card p-8 text-center">
          <p className="text-[32px] mb-2">🏗️</p>
          <p className="text-[14px] font-medium text-black">현장일지가 없습니다</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">현장 작업 내용을 기록해보세요</p>
          {onAdd && (
            <button
              onClick={onAdd}
              className="mt-4 px-5 py-2 bg-[#007AFF] text-white text-[14px] font-medium rounded-xl active:opacity-70"
            >
              현장일지 작성
            </button>
          )}
        </div>
      ) : (
        /* PC: 3열 그리드 / 모바일: 1열 */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {groups.map((group) => (
            <ProjectGroup
              key={group.projectId ?? '__none__'}
              group={group}
              memberMap={memberMap}
              onEditGroup={onEditGroup}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// ProjectGroup: 현장명 헤더 + 그 아래 작업 행들
// ═══════════════════════════════════════
function ProjectGroup({
  group,
  memberMap,
  onEditGroup,
}: {
  group: SiteGroup
  memberMap: Record<string, string>
  onEditGroup?: (group: SiteGroup) => void
}) {
  const creatorName = memberMap[group.creatorId] ?? '알 수 없음'

  // 특이사항 모음 (사진 섹션 바로 위에서 표시할 것 없으므로 제거)
  // photo_urls: 각 log에서 수집
  const allPhotoUrls: string[] = group.logs.flatMap((l: any) =>
    Array.isArray(l.photo_urls) ? l.photo_urls : []
  )

  return (
    <div className="ios-card overflow-hidden">
      {/* ── 현장 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-black/5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] bg-[#FF9500]/10 text-[#FF9500] px-2.5 py-1 rounded-full font-semibold">
              {group.projectName}
            </span>
            {group.weather && (
              <span className="text-[11px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full">
                {group.weather}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-[11px] text-[#8E8E93]">
              {creatorName}
            </span>
            {onEditGroup && (
              <button
                onClick={() => onEditGroup(group)}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-[#007AFF]/10 text-[#007AFF] text-[11px] font-medium active:opacity-60"
              >
                <Pencil className="w-3 h-3" />
                수정
              </button>
            )}
          </div>
        </div>

        {/* 공정 수 */}
        <p className="text-[11px] text-[#8E8E93] mt-1.5">
          공정 {group.logs.length}개
        </p>
      </div>

      {/* ── 작업 항목 목록 */}
      <div className="divide-y divide-black/[0.04]">
        {group.logs.map((log, idx) => (
          <WorkRow
            key={log.id}
            log={log}
            index={idx}
          />
        ))}
      </div>

      {/* ── 현장 사진 */}
      {allPhotoUrls.length > 0 && (
        <div className="px-4 py-3 border-t border-black/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Camera className="w-3.5 h-3.5 text-[#8E8E93]" />
            <span className="text-[11px] font-medium text-[#8E8E93]">현장 사진 {allPhotoUrls.length}장</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {allPhotoUrls.map((url, i) => (
              <PhotoThumb key={i} url={url} />
            ))}
          </div>
        </div>
      )}

      {/* 등록 시각 (가장 마지막 row 기준) */}
      <p className="text-[11px] text-[#C7C7CC] px-4 pb-3">
        {new Date(group.logs[group.logs.length - 1].created_at).toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })} 등록
      </p>
    </div>
  )
}

// ═══════════════════════════════════════
// PhotoThumb: 사진 썸네일 (탭하면 전체화면)
// ═══════════════════════════════════════
function PhotoThumb({ url }: { url: string }) {
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

      {/* 라이트박스 */}
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

// ═══════════════════════════════════════
// WorkRow: 공정 1개 행 (아코디언)
// ═══════════════════════════════════════
function WorkRow({
  log,
  index,
}: {
  log: any
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  const label = log.process
    ? `[${log.process}] ${log.work_content}`
    : log.work_content

  return (
    <div>
      {/* 요약 행 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-black/[0.02] select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 번호 */}
        <span className="w-5 h-5 rounded-full bg-[#34C759] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>

        {/* 공정 + 내용 + 인원수 한 줄 */}
        <div className="flex-1 min-w-0 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
          {log.process && (
            <span className="text-[11px] font-semibold text-[#34C759]">
              {log.process}
            </span>
          )}
          <span className="text-[14px] text-black">{log.work_content}</span>
          {(log.workers_count > 0 || log.worker_names) && (
            <span className="text-[12px] text-[#8E8E93] flex-shrink-0">
              {log.workers_count > 0 ? `${log.workers_count}명` : ''}
              {log.worker_names ? ` · ${log.worker_names}` : ''}
            </span>
          )}
        </div>

        {/* 펼치기 */}
        {expanded
          ? <ChevronUp className="w-4 h-4 text-[#C7C7CC] flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-[#C7C7CC] flex-shrink-0" />
        }
      </div>

      {/* 펼침 상세: 특이사항만 표시 (내용은 요약행에 이미 있음) */}
      {expanded && log.special_notes && (
        <div className="px-4 pb-3 pt-2 bg-[#F9F9FB] border-t border-black/[0.04]">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF3B30] mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-[#FF3B30] leading-relaxed">{log.special_notes}</p>
          </div>
        </div>
      )}
    </div>
  )
}
