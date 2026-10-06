'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Plus, Phone, Building2, Hash, CreditCard,
  FileText, User, Share2, Trash2, ChevronRight,
  MessageCircle, X,
} from 'lucide-react'
import { formatPhone } from '@/lib/utils'

/* ══════════════════════════════════════════════
   기본 공정 목록 (하드코딩 기본값)
══════════════════════════════════════════════ */
export const DEFAULT_PROCESSES = [
  '보양', '철거', '바닥철거', '경량철골', '금속·창호', '소방',
  '설비', '전기', '냉난방', '목작업', '문시공', '필름',
  '타일시공', '타일자재', '욕실천장', '탄성코트', '휴젠트',
  '도장', '도배', '마루', '조명', '가구', '간판', '실리콘',
  '준공청소', '잔손보기', '홈스타일링', '촬영', '스케줄 거래처', '현장 스케줄',
] as const

// 하위 호환성 유지
export const PROCESSES = DEFAULT_PROCESSES
export type Process = typeof DEFAULT_PROCESSES[number]

interface VendorsPageClientProps {
  profile: any
}

/* ══════════════════════════════════════════════
   메인 페이지
══════════════════════════════════════════════ */
export function VendorsPageClient({ profile }: VendorsPageClientProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const canManage = profile.role === 'owner' || profile.role === 'manager'
  const isOwner   = profile.role === 'owner'

  const [selectedProcess, setSelectedProcess] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)  // null = 신규

  // ── 공정 추가 UI 상태
  const [addProcessOpen, setAddProcessOpen] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')

  // ── 공정 수정 UI 상태
  const [editProcessOpen, setEditProcessOpen] = useState(false)
  const [editingProcess, setEditingProcess] = useState<{ original: string; value: string } | null>(null)

  // ── 커스텀 공정 조회 (company_processes 테이블)
  const { data: customProcesses = [] } = useQuery({
    queryKey: ['company_processes', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_processes')
        .select('name')
        .eq('company_id', profile.company_id)
        .order('created_at')
      if (error) {
        // 테이블이 없으면 빈 배열 반환 (graceful fallback)
        console.warn('company_processes 테이블 조회 실패:', error.message)
        return []
      }
      return (data || []).map((r: any) => r.name as string)
    },
    staleTime: 0,
  })

  // 전체 공정 목록 = 기본 + 커스텀 (중복 제거)
  const allProcesses: string[] = [
    ...DEFAULT_PROCESSES,
    ...customProcesses.filter((p: string) => !DEFAULT_PROCESSES.includes(p as any)),
  ]

  // ── 공정 추가 뮤테이션
  const addProcessMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('company_processes').insert({
        company_id: profile.company_id,
        created_by: profile.id,
        name,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('공정이 추가됐습니다')
      queryClient.invalidateQueries({ queryKey: ['company_processes', profile.company_id] })
      // 스케줄러도 갱신
      queryClient.invalidateQueries({ queryKey: ['company_processes_scheduler', profile.company_id] })
      setAddProcessOpen(false)
      setNewProcessName('')
    },
    onError: (e: any) => toast.error(e.message || '공정 추가에 실패했습니다'),
  })

  // ── 커스텀 공정 이름 수정 뮤테이션
  const renameProcessMutation = useMutation({
    mutationFn: async ({ original, newName }: { original: string; newName: string }) => {
      // 1) company_processes 테이블 업데이트
      const { error: e1 } = await supabase
        .from('company_processes')
        .update({ name: newName })
        .eq('company_id', profile.company_id)
        .eq('name', original)
      if (e1) throw e1
      // 2) vendors 테이블 일괄 업데이트 (해당 공정 거래처들)
      const { error: e2 } = await supabase
        .from('vendors')
        .update({ process: newName })
        .eq('company_id', profile.company_id)
        .eq('process', original)
      if (e2) throw e2
    },
    onSuccess: (_, vars) => {
      toast.success(`'${vars.original}' → '${vars.newName}' 수정됐습니다`)
      queryClient.invalidateQueries({ queryKey: ['company_processes', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['company_processes_scheduler', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['vendors', profile.company_id] })
      setEditingProcess(null)
    },
    onError: (e: any) => toast.error(e.message || '수정에 실패했습니다'),
  })

  // ── 커스텀 공정 삭제 뮤테이션
  const deleteProcessMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('company_processes')
        .delete()
        .eq('company_id', profile.company_id)
        .eq('name', name)
      if (error) throw error
    },
    onSuccess: (_, name) => {
      toast.success(`'${name}' 공정이 삭제됐습니다`)
      queryClient.invalidateQueries({ queryKey: ['company_processes', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['company_processes_scheduler', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['vendors', profile.company_id] })
    },
    onError: (e: any) => toast.error(e.message || '삭제에 실패했습니다'),
  })

  const handleAddProcess = () => {
    const name = newProcessName.trim()
    if (!name) { toast.error('공정명을 입력하세요'); return }
    if (allProcesses.includes(name)) { toast.error('이미 존재하는 공정입니다'); return }
    addProcessMutation.mutate(name)
  }

  // ── 거래처 조회
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('process')
        .order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vendors', profile.company_id] })

  // 계좌정보 조합 헬퍼 (saveMutation과 같은 스코프)
  const joinBankAccountFn = (bankName: string, holder: string, number: string) => {
    const parts = [bankName?.trim(), holder?.trim(), number?.trim()].filter(Boolean)
    return parts.join(' / ')
  }

  // ── 저장 (신규 + 수정 통합)
  const saveMutation = useMutation({
    mutationFn: async (form: any) => {
      if (form.id) {
        const { error } = await supabase.from('vendors').update({
          process: form.process, name: form.name, owner_name: form.owner_name,
          phone: form.phone, biz_number: form.biz_number,
          bank_account: joinBankAccountFn(form.bank_name, form.account_holder, form.account_number),
          memo: form.memo,
        }).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vendors').insert({
          company_id: profile.company_id,
          created_by: profile.id,
          process: form.process, name: form.name, owner_name: form.owner_name,
          phone: form.phone, biz_number: form.biz_number,
          bank_account: joinBankAccountFn(form.bank_name, form.account_holder, form.account_number),
          memo: form.memo,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editTarget?.id ? '거래처가 수정됐습니다' : '거래처가 등록됐습니다')
      refresh()
      setSheetOpen(false)
      setEditTarget(null)
    },
    onError: (e: any) => toast.error(e.message || '저장에 실패했습니다'),
  })

  // ── 삭제
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('삭제됐습니다'); refresh(); setSheetOpen(false) },
    onError: () => toast.error('삭제에 실패했습니다'),
  })

  const openNew  = () => { setEditTarget(null); setSheetOpen(true) }
  const openEdit = (v: any) => { setEditTarget(v); setSheetOpen(true) }

  // 공정별 필터링
  const filtered = selectedProcess
    ? vendors.filter((v: any) => v.process === selectedProcess)
    : vendors

  // 공정별 그룹화 (전체 보기일 때)
  const grouped = allProcesses
    .map(p => ({ process: p, items: vendors.filter((v: any) => v.process === p) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      <PageHeader
        title="거래처"
        action={canManage ? (
          <button
            onClick={openNew}
            className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        ) : undefined}
      />

      {/* ── 공정 칩 필터 */}
      <div className="bg-white border-b border-black/5 py-2">
        {/* 모바일: 가로 스크롤 */}
        <div className="flex md:hidden gap-2 px-4 overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* 공정 수정 버튼 */}
          {canManage && customProcesses.length > 0 && (
            <button
              onClick={() => setEditProcessOpen(true)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium bg-[#FF9500]/10 text-[#FF9500] flex items-center gap-1 transition-colors active:opacity-70"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>수정
            </button>
          )}
          {/* 공정 추가 버튼 */}
          {canManage && (
            <button
              onClick={() => setAddProcessOpen(true)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium bg-[#34C759]/10 text-[#34C759] flex items-center gap-1 transition-colors active:opacity-70"
            >
              <Plus className="w-3.5 h-3.5" />공정
            </button>
          )}
          {/* 전체 칩 — 총 거래처 수 */}
          <button
            onClick={() => setSelectedProcess(null)}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1',
              selectedProcess === null ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
            )}
          >
            전체
            {vendors.length > 0 && (
              <span className={cn(
                'text-[11px] font-bold px-1 rounded-full min-w-[16px] text-center',
                selectedProcess === null ? 'bg-white/20 text-white' : 'bg-[#007AFF]/10 text-[#007AFF]'
              )}>{vendors.length}</span>
            )}
          </button>
          {allProcesses.map(p => {
            const count = vendors.filter((v: any) => v.process === p).length
            return (
              <button
                key={p}
                onClick={() => setSelectedProcess(p === selectedProcess ? null : p)}
                className={cn(
                  'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1',
                  selectedProcess === p ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
                )}
              >
                {p}
                {count > 0 && (
                  <span className={cn(
                    'text-[11px] font-bold px-1 rounded-full min-w-[16px] text-center',
                    selectedProcess === p ? 'bg-white/20 text-white' : 'bg-[#007AFF]/10 text-[#007AFF]'
                  )}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* PC: flex-wrap 줄바꿈 */}
        <div className="hidden md:flex flex-wrap gap-2 px-4">
          {/* 공정 수정 버튼 */}
          {canManage && customProcesses.length > 0 && (
            <button
              onClick={() => setEditProcessOpen(true)}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-[#FF9500]/10 text-[#FF9500] flex items-center gap-1 transition-colors hover:bg-[#FF9500]/20"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>수정
            </button>
          )}
          {/* 공정 추가 버튼 */}
          {canManage && (
            <button
              onClick={() => setAddProcessOpen(true)}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-[#34C759]/10 text-[#34C759] flex items-center gap-1 transition-colors hover:bg-[#34C759]/20"
            >
              <Plus className="w-3.5 h-3.5" />공정추가
            </button>
          )}
          {/* 전체 칩 — 총 거래처 수 */}
          <button
            onClick={() => setSelectedProcess(null)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1',
              selectedProcess === null ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
            )}
          >
            전체
            {vendors.length > 0 && (
              <span className={cn(
                'text-[11px] font-bold px-1 rounded-full min-w-[16px] text-center',
                selectedProcess === null ? 'bg-white/20 text-white' : 'bg-[#007AFF]/10 text-[#007AFF]'
              )}>{vendors.length}</span>
            )}
          </button>
          {allProcesses.map(p => {
            const count = vendors.filter((v: any) => v.process === p).length
            return (
              <button
                key={p}
                onClick={() => setSelectedProcess(p === selectedProcess ? null : p)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1',
                  selectedProcess === p ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
                )}
              >
                {p}
                {count > 0 && (
                  <span className={cn(
                    'text-[11px] font-bold px-1 rounded-full min-w-[16px] text-center',
                    selectedProcess === p ? 'bg-white/20 text-white' : 'bg-[#007AFF]/10 text-[#007AFF]'
                  )}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 공정 추가 팝업 */}
      {addProcessOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAddProcessOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[17px] font-semibold">공정 추가</h3>
              <button onClick={() => setAddProcessOpen(false)} className="p-1 rounded-full hover:bg-black/5">
                <X className="w-5 h-5 text-[#8E8E93]" />
              </button>
            </div>
            <p className="text-[13px] text-[#8E8E93] mb-3">
              추가된 공정은 거래처 등록과 스케줄 등록 양쪽에 반영됩니다.
            </p>
            <input
              autoFocus
              value={newProcessName}
              onChange={e => setNewProcessName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddProcess() }}
              placeholder="공정명 입력 (예: 유리시공)"
              className="w-full text-[15px] border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7] mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAddProcessOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium"
              >
                취소
              </button>
              <button
                onClick={handleAddProcess}
                disabled={addProcessMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-[#007AFF] text-white text-[15px] font-semibold disabled:opacity-40"
              >
                {addProcessMutation.isPending ? '추가중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 공정 수정 팝업 */}
      {editProcessOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => { setEditProcessOpen(false); setEditingProcess(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <h3 className="text-[17px] font-semibold">공정 이름 수정</h3>
              <button onClick={() => { setEditProcessOpen(false); setEditingProcess(null) }} className="p-1 rounded-full hover:bg-black/5">
                <X className="w-5 h-5 text-[#8E8E93]" />
              </button>
            </div>
            <p className="text-[12px] text-[#8E8E93] px-5 pt-3 pb-1">
              추가한 공정만 수정/삭제 가능합니다. 이름 변경 시 해당 공정의 거래처도 함께 변경됩니다.
            </p>
            {/* 커스텀 공정 목록 */}
            <div className="max-h-80 overflow-y-auto divide-y divide-black/5 px-5 py-2">
              {customProcesses.length === 0 ? (
                <p className="text-center text-[13px] text-[#C7C7CC] py-6">추가한 공정이 없습니다</p>
              ) : customProcesses.map((p: string) => (
                <div key={p} className="py-2.5">
                  {editingProcess?.original === p ? (
                    /* 인라인 수정 폼 */
                    <div className="flex gap-2 items-center">
                      <input
                        autoFocus
                        value={editingProcess.value}
                        onChange={e => setEditingProcess({ original: p, value: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const v = editingProcess.value.trim()
                            if (!v || v === p) { setEditingProcess(null); return }
                            if (allProcesses.includes(v)) { toast.error('이미 존재하는 공정입니다'); return }
                            renameProcessMutation.mutate({ original: p, newName: v })
                          }
                          if (e.key === 'Escape') setEditingProcess(null)
                        }}
                        className="flex-1 text-[14px] border border-[#007AFF] rounded-lg px-2.5 py-1.5 outline-none bg-[#F2F2F7]"
                      />
                      <button
                        onClick={() => {
                          const v = editingProcess.value.trim()
                          if (!v || v === p) { setEditingProcess(null); return }
                          if (allProcesses.includes(v)) { toast.error('이미 존재하는 공정입니다'); return }
                          renameProcessMutation.mutate({ original: p, newName: v })
                        }}
                        disabled={renameProcessMutation.isPending}
                        className="px-3 py-1.5 bg-[#007AFF] text-white text-[13px] font-semibold rounded-lg disabled:opacity-40"
                      >저장</button>
                      <button
                        onClick={() => setEditingProcess(null)}
                        className="px-3 py-1.5 bg-[#F2F2F7] text-[#3C3C43] text-[13px] rounded-lg"
                      >취소</button>
                    </div>
                  ) : (
                    /* 표시 행 */
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] text-[#1C1C1E] flex-1">{p}</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setEditingProcess({ original: p, value: p })}
                          className="px-2.5 py-1 bg-[#007AFF]/10 text-[#007AFF] text-[12px] font-medium rounded-lg hover:bg-[#007AFF]/20 transition-colors"
                        >수정</button>
                        <button
                          onClick={() => {
                            const vendorCount = vendors.filter((v: any) => v.process === p).length
                            const msg = vendorCount > 0
                              ? `'${p}' 공정을 삭제할까요?\n(거래처 ${vendorCount}곳의 공정이 비워집니다)`
                              : `'${p}' 공정을 삭제할까요?`
                            if (confirm(msg)) deleteProcessMutation.mutate(p)
                          }}
                          disabled={deleteProcessMutation.isPending}
                          className="px-2.5 py-1 bg-[#FF3B30]/10 text-[#FF3B30] text-[12px] font-medium rounded-lg hover:bg-[#FF3B30]/20 transition-colors disabled:opacity-40"
                        >삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-black/5">
              <button
                onClick={() => { setEditProcessOpen(false); setEditingProcess(null) }}
                className="w-full py-2.5 rounded-xl bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium"
              >닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-safe">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ios-card p-10 text-center mt-2">
            <p className="text-[36px] mb-2">🏢</p>
            <p className="text-[15px] font-semibold text-black mb-1">
              {selectedProcess ? `${selectedProcess} 거래처가 없습니다` : '등록된 거래처가 없습니다'}
            </p>
            {canManage && (
              <p className="text-[13px] text-[#8E8E93]">우측 상단 + 버튼으로 등록하세요</p>
            )}
          </div>
        ) : selectedProcess ? (
          /* 특정 공정 필터 — 그리드 */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((v: any) => (
              <VendorCard key={v.id} vendor={v} onPress={() => openEdit(v)} />
            ))}
          </div>
        ) : (
          /* 전체 — 공정별 그룹, 각 그룹 내부도 그리드 */
          <div className="space-y-5">
            {grouped.map(g => (
              <div key={g.process}>
                <p className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wide mb-2 px-1">
                  {g.process} <span className="font-normal text-[#C7C7CC]">{g.items.length}곳</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.items.map((v: any) => (
                    <VendorCard key={v.id} vendor={v} onPress={() => openEdit(v)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 등록/수정 Sheet */}
      <VendorSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditTarget(null) }}
        initial={editTarget}
        defaultProcess={selectedProcess ?? undefined}
        canManage={canManage}
        isOwner={isOwner}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
        onSave={(form) => saveMutation.mutate(form)}
        onDelete={(id) => deleteMutation.mutate(id)}
        allProcesses={allProcesses}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════
   전화번호 정규화 (하이픈 제거)
══════════════════════════════════════════════ */
function toRawPhone(phone: string) {
  return phone.replace(/[^0-9]/g, '')
}

/* ══════════════════════════════════════════════
   거래처 카드
══════════════════════════════════════════════ */
function VendorCard({ vendor, onPress }: { vendor: any; onPress: () => void }) {
  const rawPhone = vendor.phone ? toRawPhone(vendor.phone) : ''

  // 전화 걸기
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!rawPhone) return
    window.location.href = `tel:${rawPhone}`
  }

  // 문자 보내기 (SMS)
  const handleSMS = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!rawPhone) return
    window.location.href = `sms:${rawPhone}`
  }

  // 카카오톡 — 친구 탭 바로 열기
  const handleKakao = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!rawPhone) return
    window.location.href = 'kakaotalk://friends'
  }

  // 공유
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = [
      `[${vendor.process}] ${vendor.name}`,
      vendor.owner_name ? `대표: ${vendor.owner_name}` : '',
      vendor.phone      ? `전화: ${vendor.phone}` : '',
      vendor.biz_number ? `사업자: ${vendor.biz_number}` : '',
      vendor.bank_account ? `계좌: ${vendor.bank_account}` : '',
      vendor.memo       ? `메모: ${vendor.memo}` : '',
    ].filter(Boolean).join('\n')

    if (navigator.share) {
      navigator.share({ title: vendor.name, text })
    } else {
      navigator.clipboard.writeText(text)
      toast.success('연락처가 복사됐습니다')
    }
  }

  return (
    <div className="ios-card overflow-hidden">
      {/* 메인 행 — 클릭 시 수정 */}
      <div
        onClick={onPress}
        className="px-4 py-3.5 active:bg-black/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#007AFF]/8 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-[#007AFF]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-black truncate">{vendor.name}</p>
              <span className="text-[10px] px-2 py-0.5 bg-[#007AFF]/8 text-[#007AFF] rounded-full font-medium flex-shrink-0">
                {vendor.process}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {vendor.owner_name && (
                <span className="text-[12px] text-[#8E8E93] flex items-center gap-0.5">
                  <User className="w-3 h-3" />{vendor.owner_name}
                </span>
              )}
              {vendor.phone && (
                <span className="text-[12px] text-[#8E8E93] flex items-center gap-0.5">
                  <Phone className="w-3 h-3" />{vendor.phone}
                </span>
              )}
            </div>
            {vendor.memo && (
              <p className="text-[11px] text-[#C7C7CC] mt-0.5 truncate">{vendor.memo}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-[#C7C7CC] flex-shrink-0" />
        </div>
      </div>

      {/* 액션 버튼 행 — 항상 노출, 전화번호 없으면 전화/문자/카카오 비활성 */}
      <div className="flex border-t border-black/5">
        {/* 전화 */}
        <button
          onClick={handleCall}
          disabled={!rawPhone}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-medium transition-colors',
            rawPhone ? 'text-[#34C759] active:bg-black/5' : 'text-[#C7C7CC]'
          )}
        >
          <Phone className="w-3.5 h-3.5" />
          전화
        </button>
        <div className="w-px bg-black/5" />
        {/* 문자 */}
        <button
          onClick={handleSMS}
          disabled={!rawPhone}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-medium transition-colors',
            rawPhone ? 'text-[#007AFF] active:bg-black/5' : 'text-[#C7C7CC]'
          )}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          문자
        </button>
        <div className="w-px bg-black/5" />
        {/* 카카오톡 */}
        <button
          onClick={handleKakao}
          disabled={!rawPhone}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 text-[13px] font-medium transition-colors',
            rawPhone ? 'active:bg-black/5' : 'opacity-30'
          )}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill={rawPhone ? '#3A1D1D' : '#C7C7CC'}>
            <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.6 5.08 4.03 6.52L5 21l4.38-2.6A11.6 11.6 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8C22 6.477 17.523 3 12 3Z"/>
          </svg>
          <span className={rawPhone ? 'text-[#3A1D1D]' : 'text-[#C7C7CC]'}>카카오</span>
        </button>
        <div className="w-px bg-black/5" />
        {/* 공유 */}
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 text-[#8E8E93] text-[13px] font-medium active:bg-black/5 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          공유
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   등록/수정 Sheet
══════════════════════════════════════════════ */
function VendorSheet({
  open, onClose, initial, defaultProcess,
  canManage, isOwner,
  isSaving, isDeleting,
  onSave, onDelete, allProcesses,
}: {
  open: boolean
  onClose: () => void
  initial: any | null
  defaultProcess?: string
  canManage: boolean
  isOwner: boolean
  isSaving: boolean
  isDeleting: boolean
  onSave: (form: any) => void
  onDelete: (id: string) => void
  allProcesses: string[]
}) {
  const isEdit = !!initial?.id

  // bank_account 파싱 헬퍼 ("은행 / 예금주 / 계좌번호" 형식)
  const parseBankAccount = (raw: string) => {
    const parts = (raw ?? '').split('/').map((s: string) => s.trim())
    return {
      bank_name:      parts[0] ?? '',
      account_holder: parts[1] ?? '',
      account_number: parts[2] ?? '',
    }
  }
  const joinBankAccount = (bankName: string, holder: string, number: string) => {
    const parts = [bankName.trim(), holder.trim(), number.trim()].filter(Boolean)
    return parts.join(' / ')
  }

  const blankForm = () => ({
    process:        defaultProcess ?? (allProcesses[0] ?? DEFAULT_PROCESSES[0]),
    name:           '',
    owner_name:     '',
    phone:          '',
    biz_number:     '',
    bank_name:      '',
    account_holder: '',
    account_number: '',
    memo:           '',
  })

  const [form, setForm] = useState<Record<string, string>>(blankForm())
  const [confirmDelete, setConfirmDelete] = useState(false)

  // open/initial 변경 시 폼 초기화
  useEffect(() => {
    if (open) {
      setForm(initial
        ? (() => {
            const parsed = parseBankAccount(initial.bank_account ?? '')
            return {
              process:        initial.process      ?? (allProcesses[0] ?? DEFAULT_PROCESSES[0]),
              name:           initial.name         ?? '',
              owner_name:     initial.owner_name   ?? '',
              phone:          initial.phone        ?? '',
              biz_number:     initial.biz_number   ?? '',
              bank_name:      parsed.bank_name,
              account_holder: parsed.account_holder || initial.owner_name || '',
              account_number: parsed.account_number,
              memo:           initial.memo         ?? '',
            }
          })()
        : { ...blankForm(), process: defaultProcess ?? (allProcesses[0] ?? DEFAULT_PROCESSES[0]) }
      )
      setConfirmDelete(false)
    }
  }, [open, initial])

  const handleOpenChange = (v: boolean) => { if (!v) onClose() }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const val = key === 'phone' ? formatPhone(e.target.value) : e.target.value
    setForm(f => ({ ...f, [key]: val }))
  }

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('업체명을 입력하세요'); return }
    onSave(isEdit ? { ...form, id: initial.id } : form)
  }

  const handleShare = () => {
    const text = [
      `[${form.process}] ${form.name}`,
      form.owner_name   ? `대표: ${form.owner_name}` : '',
      form.phone        ? `전화: ${form.phone}` : '',
      form.biz_number   ? `사업자: ${form.biz_number}` : '',
      form.bank_account ? `계좌: ${form.bank_account}` : '',
      form.memo         ? `메모: ${form.memo}` : '',
    ].filter(Boolean).join('\n')

    if (navigator.share) {
      navigator.share({ title: form.name, text })
    } else {
      navigator.clipboard.writeText(text)
      toast.success('연락처가 복사됐습니다')
    }
  }

  const handlePickContact = async () => {
    const nav = navigator as any
    if (!nav.contacts || !nav.ContactsManager) {
      toast.error('이 브라우저는 연락처 불러오기를 지원하지 않습니다\n직접 입력해 주세요')
      return
    }
    try {
      const contacts = await nav.contacts.select(['name', 'tel'], { multiple: false })
      if (contacts && contacts.length > 0) {
        const c = contacts[0]
        const name  = c.name?.[0]  || ''
        const phone = c.tel?.[0]   || ''
        setForm(f => ({
          ...f,
          owner_name: name  ? name  : f.owner_name,
          phone:      phone ? formatPhone(phone) : f.phone,
        }))
        toast.success(`${name} 연락처를 불러왔습니다`)
      }
    } catch {
      // 사용자가 취소한 경우 — 무시
    }
  }

  const inputCls = 'w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]'
  const labelCls = 'text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1'
  const isPending = isSaving || isDeleting

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/*
        ★ 스크롤 핵심 수정:
        SheetContent 자체는 position:fixed 이고 iOS에서 height DVH가 불안정함.
        → SheetContent를 꽉 채운 래퍼로 감싸고, 내부에서 flex+overflow-y-auto 처리.
        → 외부 컨테이너에 max-h를 CSS var로 직접 주입.
      */}
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{
          maxHeight: 'min(92dvh, 92vh)',
          height: 'min(92dvh, 92vh)',
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* 헤더 — flex-shrink-0 고정 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#FF3B30] text-[16px] min-w-[44px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">
              {isEdit ? '거래처 수정' : '거래처 등록'}
            </SheetTitle>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40 min-w-[44px] text-right"
            >
              {isSaving ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* ★ 스크롤 영역 — flex-1 + overflow-y-auto + overscroll-contain */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="px-5 py-4 space-y-4">

            {/* 공정 선택 */}
            <div>
              <label className={labelCls}>
                <Hash className="w-3.5 h-3.5" />공정
              </label>
              <div className="flex flex-wrap gap-2">
                {allProcesses.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, process: p }))}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[13px] font-medium transition-all',
                      form.process === p
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-[#F2F2F7] text-[#3C3C43]'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-black/5" />

            {/* 업체명 */}
            <div>
              <label className={labelCls}>
                <Building2 className="w-3.5 h-3.5" />업체명 *
              </label>
              <input value={form.name} onChange={set('name')} placeholder="업체명 입력" className={inputCls} />
            </div>

            {/* 대표 이름 + 연락처 불러오기 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>
                  <User className="w-3.5 h-3.5" />대표 이름
                </label>
                <button
                  type="button"
                  onClick={handlePickContact}
                  className="text-[12px] text-[#007AFF] font-medium flex items-center gap-1 active:opacity-60"
                >
                  <Phone className="w-3 h-3" />
                  연락처 불러오기
                </button>
              </div>
              <input value={form.owner_name} onChange={set('owner_name')} placeholder="대표 이름" className={inputCls} />
            </div>

            {/* 전화번호 */}
            <div>
              <label className={labelCls}>
                <Phone className="w-3.5 h-3.5" />전화번호
              </label>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="010-0000-0000" className={inputCls} />
            </div>

            {/* 사업자번호 */}
            <div>
              <label className={labelCls}>
                <Hash className="w-3.5 h-3.5" />사업자번호
              </label>
              <input value={form.biz_number} onChange={set('biz_number')} placeholder="000-00-00000" className={inputCls} />
            </div>

            {/* 사업자계좌 — 예금주 / 은행 / 계좌번호 */}
            <div className="space-y-2">
              <label className={labelCls}>
                <CreditCard className="w-3.5 h-3.5" />사업자계좌
              </label>
              <div className="flex gap-2">
                <input
                  value={form.bank_name}
                  onChange={set('bank_name')}
                  placeholder="은행 (예: 국민은행)"
                  className={inputCls + ' flex-1'}
                />
                <input
                  value={form.account_holder}
                  onChange={set('account_holder')}
                  placeholder="예금주"
                  className={inputCls + ' flex-1'}
                />
              </div>
              <input
                value={form.account_number}
                onChange={set('account_number')}
                placeholder="계좌번호"
                inputMode="numeric"
                className={inputCls}
              />
            </div>

            {/* 메모 */}
            <div>
              <label className={labelCls}>
                <FileText className="w-3.5 h-3.5" />메모
              </label>
              <textarea
                value={form.memo}
                onChange={set('memo')}
                placeholder="특이사항, 단가, 조건 등 자유 메모"
                rows={3}
                className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7] resize-none"
              />
            </div>

            {/* ── 공유 + 삭제 버튼 행 */}
            <div className={cn('flex gap-2', isEdit && canManage ? '' : '')}>
              {/* 연락처 공유 */}
              <button
                type="button"
                onClick={handleShare}
                className={cn(
                  'flex-1 py-3 rounded-xl bg-[#007AFF]/8 text-[#007AFF] text-[15px] font-medium flex items-center justify-center gap-2 active:opacity-70',
                )}
              >
                <Share2 className="w-4 h-4" />
                연락처 공유
              </button>

              {/* 삭제 버튼 — 수정 모드 + owner/manager */}
              {isEdit && canManage && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="py-3 px-4 rounded-xl bg-[#FF3B30]/8 text-[#FF3B30] text-[15px] font-medium flex items-center justify-center gap-1.5 active:opacity-70 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </button>
              )}
            </div>

            {/* 삭제 확인 패널 */}
            {isEdit && canManage && confirmDelete && (
              <div className="rounded-xl bg-[#FF3B30]/5 border border-[#FF3B30]/20 p-4 space-y-3">
                <p className="text-[13px] text-[#FF3B30] font-medium text-center">정말 삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2.5 bg-white text-[#8E8E93] text-[14px] rounded-xl border border-black/10"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => onDelete(initial.id)}
                    disabled={isDeleting}
                    className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[14px] font-semibold rounded-xl disabled:opacity-40"
                  >
                    {isDeleting ? '삭제중...' : '삭제'}
                  </button>
                </div>
              </div>
            )}

            {/* 하단 safe area 여백 */}
            <div className="h-8" />

          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
