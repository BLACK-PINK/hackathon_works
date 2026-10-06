'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, Phone, CheckCircle2, Circle, ChevronDown, ChevronLeft, ChevronRight, Pencil, CalendarClock, User, UserCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { AddAsRecordSheet } from '@/components/journal/AddAsRecordSheet'
import { AsDetailSheet } from '@/components/as/AsDetailSheet'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

interface AsPageClientProps {
  profile: any
}

function formatVisitDisplay(val: string | null | undefined) {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  const h = d.getHours(), m = d.getMinutes()
  const hasTime = !(h === 0 && m === 0)
  if (hasTime) return format(d, 'M/d HH:mm')
  return format(d, 'M/d')
}

export function AsPageClient({ profile }: AsPageClientProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [showAdd, setShowAdd] = useState(false)
  const [editRecord, setEditRecord] = useState<any | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [listKey, setListKey] = useState(0)

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')

  // ── ① 미처리 목록: 월 무관, status가 completed/cancelled 아닌 전체
  const { data: pendingRecords = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['as-pending', profile.company_id, listKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('as_records')
        .select(`*, project:projects(id, name)`)
        .eq('company_id', profile.company_id)
        .not('status', 'in', '("completed","cancelled")')
        .order('received_date', { ascending: false })
      if (error) { console.error('[as pending error]', error); throw error }
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  // ── ② 완료 목록: completed_date 기준 월별 필터
  const { data: doneRecords = [], isLoading: doneLoading } = useQuery({
    queryKey: ['as-done', profile.company_id, monthStart, monthEnd, listKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('as_records')
        .select(`*, project:projects(id, name)`)
        .eq('company_id', profile.company_id)
        .in('status', ['completed', 'cancelled'])
        .gte('completed_date', monthStart)
        .lte('completed_date', monthEnd)
        .order('completed_date', { ascending: false })
      if (error) { console.error('[as done error]', error); throw error }
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const { data: activeProjects = [] } = useQuery({
    queryKey: ['as-projects-active', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects').select('id, name')
        .eq('company_id', profile.company_id)
        .eq('status', 'active').order('name')
      return data || []
    },
  })

  const { data: completedProjects = [] } = useQuery({
    queryKey: ['as-projects-completed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects').select('id, name')
        .eq('company_id', profile.company_id)
        .eq('status', 'completed').order('name')
      return data || []
    },
  })

  const allProjects = [...activeProjects, ...completedProjects]

  const { data: members = [] } = useQuery({
    queryKey: ['members-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles').select('id, name')
        .eq('company_id', profile.company_id)
      return data || []
    },
  })

  const getMemberName = (id: string) => {
    const m = members.find((m: any) => m.id === id)
    return m?.name || null
  }

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors').select('id, name')
        .eq('company_id', profile.company_id)
      return data || []
    },
  })

  const getVendorName = (id: string) => {
    const v = vendors.find((v: any) => v.id === id)
    return v?.name || null
  }

  const refresh = () => {
    setListKey(k => k + 1)
    queryClient.invalidateQueries({ queryKey: ['as-pending'] })
    queryClient.invalidateQueries({ queryKey: ['as-done'] })
  }

  // 현장 필터 적용
  const filteredPending = useMemo(() => {
    if (!selectedProject) return pendingRecords
    if (selectedProject === '__none__') return pendingRecords.filter((r: any) => !r.project_id)
    return pendingRecords.filter((r: any) => r.project_id === selectedProject)
  }, [pendingRecords, selectedProject])

  const filteredDone = useMemo(() => {
    if (!selectedProject) return doneRecords
    if (selectedProject === '__none__') return doneRecords.filter((r: any) => !r.project_id)
    return doneRecords.filter((r: any) => r.project_id === selectedProject)
  }, [doneRecords, selectedProject])

  const completeMutation = useMutation({
    mutationFn: async ({ id, isDone }: { id: string; isDone: boolean }) => {
      const { error } = await supabase.from('as_records').update(
        isDone
          ? { status: 'received', completed_date: null }
          : { status: 'completed', completed_date: new Date().toISOString().slice(0, 10) }
      ).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success(vars.isDone ? '완료가 취소되었습니다' : 'A/S가 완료 처리되었습니다')
      refresh()
    },
    onError: () => toast.error('처리에 실패했습니다'),
  })

  const isCurrentMonth = format(currentMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="A/S"
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-safe">

        {/* 헤더 — 현장 필터 + 완료 월 네비게이션 */}
        <div className="bg-white border-b border-black/5 px-4 py-3 space-y-2.5">

          {/* 현장 필터 */}
          {allProjects.length > 0 && (
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none appearance-none pr-8"
              >
                <option value="">전체 현장</option>
                <option value="__none__">📌 현장 미지정 (직접입력 포함)</option>
                {activeProjects.length > 0 && (
                  <optgroup label="── 진행중 현장">
                    {activeProjects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
                {completedProjects.length > 0 && (
                  <optgroup label="── 완료된 현장">
                    {completedProjects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
            </div>
          )}

          {/* 완료 목록용 월 네비게이션 */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93] font-medium">완료 기준 월</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCurrentMonth(m => subMonths(m, 1)); setExpandedId(null) }}
                className="w-7 h-7 flex items-center justify-center rounded-full active:bg-black/5"
              >
                <ChevronLeft className="w-4 h-4 text-[#007AFF]" />
              </button>
              <button
                onClick={() => { setCurrentMonth(new Date()); setExpandedId(null) }}
                className="flex items-center gap-1"
              >
                <span className="text-[15px] font-semibold text-black">
                  {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                </span>
                {!isCurrentMonth && (
                  <span className="text-[11px] text-[#007AFF]">↩</span>
                )}
              </button>
              <button
                onClick={() => { setCurrentMonth(m => addMonths(m, 1)); setExpandedId(null) }}
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-full active:bg-black/5',
                  isCurrentMonth && 'opacity-30 pointer-events-none'
                )}
              >
                <ChevronRight className="w-4 h-4 text-[#007AFF]" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:grid md:grid-cols-2 md:gap-5 md:items-start md:space-y-0 space-y-4">

          {/* ── 좌측: 처리중 (미완료 전체 — 월 무관) ── */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#FF9500] uppercase tracking-wide">처리중</span>
              <span className="text-[12px] text-[#8E8E93] font-medium">
                {pendingLoading ? '...' : `${filteredPending.length}건`}
              </span>
              <div className="flex-1 h-px bg-[#FF9500]/20" />
            </div>

            {pendingLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="ios-card p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!pendingLoading && filteredPending.length === 0 && (
              <div className="ios-card p-8 text-center mt-2">
                <p className="text-[32px] mb-2">✅</p>
                <p className="text-[14px] font-medium text-black">미처리 A/S가 없습니다</p>
                <p className="text-[13px] text-[#8E8E93] mt-1">새 A/S를 접수해보세요</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-5 py-2 bg-[#007AFF] text-white text-[14px] font-medium rounded-xl active:opacity-70"
                >
                  A/S 접수
                </button>
              </div>
            )}

            {!pendingLoading && filteredPending.length > 0 && (
              <div className="space-y-2">
                {filteredPending.map((record: any) => (
                  <AsCard
                    key={record.id}
                    record={record}
                    isExpanded={expandedId === record.id}
                    onToggleExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    onEdit={(e) => { e.stopPropagation(); setEditRecord(record) }}
                    onComplete={(e) => { e.stopPropagation(); completeMutation.mutate({ id: record.id, isDone: false }) }}
                    onRevert={(e) => { e.stopPropagation(); completeMutation.mutate({ id: record.id, isDone: true }) }}
                    isPending={completeMutation.isPending}
                    getVendorName={getVendorName}
                    getMemberName={getMemberName}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── 우측: 완료 (completed_date 기준 선택 월) ── */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#34C759] uppercase tracking-wide">완료</span>
              <span className="text-[12px] text-[#8E8E93] font-medium">
                {doneLoading ? '...' : `${filteredDone.length}건`}
              </span>
              <span className="text-[11px] text-[#C7C7CC]">
                {format(currentMonth, 'M월', { locale: ko })} 기준
              </span>
              <div className="flex-1 h-px bg-[#34C759]/20" />
            </div>

            {doneLoading && (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="ios-card p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {!doneLoading && filteredDone.length === 0 && (
              <div className="ios-card p-6 text-center text-[13px] text-[#8E8E93]">
                {format(currentMonth, 'M월', { locale: ko })} 완료 내역이 없습니다
              </div>
            )}

            {!doneLoading && filteredDone.length > 0 && (
              <div className="space-y-2">
                {filteredDone.map((record: any) => (
                  <AsCard
                    key={record.id}
                    record={record}
                    isDone
                    isExpanded={expandedId === record.id}
                    onToggleExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    onEdit={(e) => { e.stopPropagation(); setEditRecord(record) }}
                    onComplete={(e) => { e.stopPropagation(); completeMutation.mutate({ id: record.id, isDone: false }) }}
                    onRevert={(e) => { e.stopPropagation(); completeMutation.mutate({ id: record.id, isDone: true }) }}
                    isPending={completeMutation.isPending}
                    getVendorName={getVendorName}
                    getMemberName={getMemberName}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <AddAsRecordSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { setShowAdd(false); refresh() }}
        profile={profile}
      />

      <AsDetailSheet
        record={editRecord}
        open={!!editRecord}
        onClose={() => setEditRecord(null)}
        onUpdated={() => { setEditRecord(null); refresh() }}
        profile={profile}
      />
    </div>
  )
}

interface AsCardProps {
  record: any
  isDone?: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: (e: React.MouseEvent) => void
  onComplete: (e: React.MouseEvent) => void
  onRevert: (e: React.MouseEvent) => void
  isPending?: boolean
  getVendorName: (id: string) => string | null
  getMemberName: (id: string) => string | null
}

function AsCard({ record, isDone = false, isExpanded, onToggleExpand, onEdit, onComplete, onRevert, isPending, getVendorName, getMemberName }: AsCardProps) {
  const visitDisplay = formatVisitDisplay(record.visit_date)
  const assigneeName = record.vendor_assigned_to ? getVendorName(record.vendor_assigned_to) : null

  return (
    <div className={cn('ios-card overflow-hidden animate-fade-in-up', isDone && 'opacity-60')}>
      {/* 헤더 행 */}
      <div
        className="p-4 flex items-center gap-3 cursor-pointer active:bg-black/5 transition-colors"
        onClick={onToggleExpand}
      >
        <button
          onClick={isDone ? onRevert : onComplete}
          disabled={isPending}
          className="flex-shrink-0 active:opacity-60 disabled:opacity-40"
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-[#34C759]" />
            : <Circle className="w-5 h-5 text-[#C7C7CC]" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[11px] text-[#8E8E93]">접수 {record.received_date}</span>
            {(record.project || record.site_name) && (
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded-full',
                record.site_name
                  ? 'bg-[#FF9500]/10 text-[#FF9500]'
                  : 'bg-[#007AFF]/10 text-[#007AFF]'
              )}>
                {record.site_name || record.project?.name}
              </span>
            )}
            {record.completed_date && (
              <span className="text-[11px] text-[#34C759]">완료 {record.completed_date}</span>
            )}
          </div>
          <p className={cn(
            'text-[15px] font-medium leading-snug truncate',
            isDone ? 'line-through text-[#8E8E93]' : 'text-black'
          )}>
            {record.content}
          </p>
          {visitDisplay && !isExpanded && (
            <p className="text-[12px] text-[#007AFF] mt-0.5 flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              방문예정 {visitDisplay}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg active:bg-[#007AFF]/10">
            <Pencil className="w-4 h-4 text-[#007AFF]" />
          </button>
          <ChevronDown className={cn(
            'w-4 h-4 text-[#C7C7CC] transition-transform duration-200',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-black/5 bg-[#F9F9FB] px-4 py-3 space-y-3">

          <DetailItem label="A/S 내용">
            <p className="text-[14px] text-black leading-relaxed whitespace-pre-wrap">{record.content}</p>
          </DetailItem>

          {record.resolution && (
            <DetailItem label="처리 내용">
              <p className="text-[14px] text-black leading-relaxed whitespace-pre-wrap">{record.resolution}</p>
            </DetailItem>
          )}

          <div className="grid grid-cols-3 gap-2">
            {visitDisplay && (
              <DetailItem label="방문예정일">
                <p className="text-[13px] text-[#007AFF] flex items-center gap-0.5">
                  <CalendarClock className="w-3 h-3 flex-shrink-0" />
                  {visitDisplay}
                </p>
              </DetailItem>
            )}
            {assigneeName && (
              <DetailItem label="담당자">
                <p className="text-[13px] text-black flex items-center gap-0.5">
                  <User className="w-3 h-3 flex-shrink-0 text-[#8E8E93]" />
                  {assigneeName}
                </p>
              </DetailItem>
            )}
            {record.handler_name && (() => {
              const displayName = getMemberName(record.handler_name) || record.handler_name
              return (
                <DetailItem label="처리자">
                  <p className="text-[13px] text-black flex items-center gap-0.5">
                    <UserCheck className="w-3 h-3 flex-shrink-0 text-[#34C759]" />
                    {displayName}
                  </p>
                </DetailItem>
              )
            })()}
          </div>

          {(record.client_name || record.client_phone) && (
            <DetailItem label="고객 정보">
              <p className="text-[14px] text-black flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-[#8E8E93]" />
                {record.client_name}
                {record.client_name && record.client_phone && ' · '}
                {record.client_phone}
              </p>
            </DetailItem>
          )}

          <div className="flex gap-4 flex-wrap">
            <DetailItem label="접수일">
              <p className="text-[13px] text-black">{record.received_date}</p>
            </DetailItem>
            {record.completed_date && (
              <DetailItem label="완료일">
                <p className="text-[13px] text-[#34C759]">{record.completed_date}</p>
              </DetailItem>
            )}
          </div>

          <div className="pt-1">
            {!isDone ? (
              <button
                onClick={onComplete}
                disabled={isPending}
                className="w-full py-2.5 bg-[#34C759] text-white text-[14px] font-semibold rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                A/S 완료 처리
              </button>
            ) : (
              <button
                onClick={onRevert}
                disabled={isPending}
                className="w-full py-2.5 bg-[#F2F2F7] text-[#8E8E93] text-[14px] font-medium rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
              >
                완료 취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}
