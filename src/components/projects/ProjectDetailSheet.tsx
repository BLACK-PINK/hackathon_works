'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import {
  MapPin, Phone, Calendar, DollarSign, ClipboardList,
  ChevronRight, X, CheckCircle2, Clock, Pencil, Trash2, Plus
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface EditScheduleRow {
  localId: string    // 로카4 UI용 (DB id 또는 신규)
  dbId?: string      // 실제 DB id (없으면 신규)
  date: string
  supplyAmount: string
  vatAmount: string
  description: string
  vatIssued: boolean  // 부가세 발행 여부
  deleted?: boolean
}

const DEFAULT_SCHEDULE_LABELS = ['계약금', '착수금', '중도금', '잔금', '추가공사 금액']

function newEditRow(label = ''): EditScheduleRow {
  return {
    localId: Math.random().toString(36).slice(2),
    date: format(new Date(), 'yyyy-MM-dd'),
    supplyAmount: '',
    vatAmount: '',
    description: label,
    vatIssued: true,  // 기본값: 부가세 발행
  }
}

function makeDefaultEditSchedules(): EditScheduleRow[] {
  return DEFAULT_SCHEDULE_LABELS.map(label => newEditRow(label))
}

function fmtAmt(v: string) {
  const n = v.replace(/\D/g, '')
  return n ? parseInt(n).toLocaleString() : ''
}

interface ProjectDetailSheetProps {
  project: any | null
  open: boolean
  onClose: () => void
  profile: any
}

const statusColors: Record<string, string> = {
  active: 'bg-[#34C759]/10 text-[#34C759]',
  completed: 'bg-[#8E8E93]/10 text-[#8E8E93]',
  paused: 'bg-[#FF9500]/10 text-[#FF9500]',
  cancelled: 'bg-[#FF3B30]/10 text-[#FF3B30]',
}

export function ProjectDetailSheet({ project, open, onClose, profile }: ProjectDetailSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const isOwnerOrManager = profile.role === 'owner' || profile.role === 'manager'
  const isOwner = profile.role === 'owner'

  // ── 결제(매출) 스케줄 조회 ──
  const { data: revenueSchedules = [] } = useQuery({
    queryKey: ['project-revenue-schedules', project?.id],
    queryFn: async () => {
      if (!project?.id) return []
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, supply_amount, vat_amount, description, is_completed')
        .eq('project_id', project.id)
        .eq('flow_type', 'revenue')
        .order('scheduled_date', { ascending: true })
      return data || []
    },
    enabled: !!project?.id && open,
  })

  // 편집 상태
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [unitPassword, setUnitPassword] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractAmount, setContractAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState('')
  const [description, setDescription] = useState('')
  const [editSchedules, setEditSchedules] = useState<EditScheduleRow[]>([])

  const startEdit = () => {
    setName(project?.name || '')
    setAddress(project?.address || '')
    setAccessCode(project?.access_code || '')
    setUnitPassword(project?.unit_password || '')
    setClientName(project?.client_name || '')
    setClientPhone(project?.client_phone || '')
    setContractAmount(project?.contract_amount ? project.contract_amount.toLocaleString() : '')
    setStartDate(project?.start_date || '')
    setEndDate(project?.end_date || '')
    setStatus(project?.status || 'active')
    setDescription(project?.description || '')
    // 기존 결제일을 편집 폼으로 복사 — 항상 기본 5개 라벨 유지
    // DB에 있는 항목은 그대로 쓰고, 없는 라벨은 빈 항목으로 채워서 항상 5개 표시
    const dbRows: EditScheduleRow[] = revenueSchedules.map((s: any) => ({
      localId: s.id,
      dbId: s.id,
      date: s.scheduled_date,
      supplyAmount: (Number(s.supply_amount) || Number(s.amount)).toLocaleString(),
      vatAmount: Number(s.vat_amount) > 0 ? Number(s.vat_amount).toLocaleString() : '',
      description: s.description || '',
      vatType: (s.vat_type === 'issued' ? 'issued' : 'not_issued') as 'issued' | 'not_issued',
    }))

    // DB에 이미 있는 description 라벨 수집
    const existingLabels = new Set(dbRows.map(r => r.description.trim()))

    // 기본 5개 중 아직 없는 라벨만 빈 항목으로 추가
    const missingRows: EditScheduleRow[] = DEFAULT_SCHEDULE_LABELS
      .filter(label => !existingLabels.has(label))
      .map(label => newEditRow(label))

    setEditSchedules([...dbRows, ...missingRows])
    setEditMode(true)
  }

  const updateEditSchedule = (localId: string, key: keyof EditScheduleRow, val: string) => {
    setEditSchedules(prev => prev.map(r => r.localId === localId ? { ...r, [key]: val } : r))
  }

  const handleEditSupplyChange = (localId: string, v: string) => {
    const raw = v.replace(/\D/g, '')
    const num = parseInt(raw) || 0
    setEditSchedules(prev => prev.map(r => r.localId === localId ? {
      ...r,
      supplyAmount: raw ? num.toLocaleString() : '',
      // vatType='issued'인 경우에만 자동계산
      vatAmount: (r.vatType === 'issued' && raw) ? Math.round(num * 0.1).toLocaleString() : r.vatAmount,
    } : r))
  }

  const handleEditVatTypeChange = (localId: string, checked: boolean) => {
    setEditSchedules(prev => prev.map(r => {
      if (r.localId !== localId) return r
      const supply = parseInt(r.supplyAmount.replace(/,/g, '')) || 0
      const newVatType = checked ? 'issued' : 'not_issued'
      return {
        ...r,
        vatType: newVatType as 'issued' | 'not_issued',
        vatAmount: checked
          ? supply > 0 ? Math.round(supply * 0.1).toLocaleString() : r.vatAmount
          : '0',
      }
    }))
  }

  const updateProject = useMutation({
    mutationFn: async () => {
      // 1) 현장 기본정보 수정
      const { error } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          address: address.trim() || null,
          access_code: accessCode.trim() || null,
          unit_password: unitPassword.trim() || null,
          client_name: clientName.trim() || null,
          client_phone: clientPhone.trim() || null,
          contract_amount: contractAmount ? parseInt(contractAmount.replace(/,/g, '')) : 0,
          start_date: startDate || null,
          end_date: endDate || null,
          status,
          description: description.trim() || null,
        })
        .eq('id', project.id)
      if (error) throw error

      // 2) 스케줄 동기화
      // 2a) 삭제: DB에는 있지만 editSchedules에서 없는 항목
      const keptDbIds = editSchedules.filter(r => r.dbId).map(r => r.dbId!)
      const toDelete = revenueSchedules
        .map((s: any) => s.id)
        .filter((id: string) => !keptDbIds.includes(id))
      if (toDelete.length > 0) {
        await supabase.from('cash_flow_schedules').delete().in('id', toDelete)
      }

      // 2b) upsert: 기존 항목 업데이트 + 신규 항목 인서트
      // description이 있으면 금액이 0이어도 저장 (항목 보존)
      for (const r of editSchedules) {
        if (!r.description.trim()) continue  // 내용 없는 항목만 skip
        const supply = parseInt(r.supplyAmount.replace(/,/g, '')) || 0
        // vatType='not_issued'면 vat=0으로 저장
        const vat    = r.vatType === 'issued' ? (parseInt((r.vatAmount || '').replace(/,/g, '')) || 0) : 0
        const payload = {
          company_id:     profile.company_id,
          project_id:     project.id,
          flow_type:      'revenue' as const,
          scheduled_date: r.date,
          supply_amount:  supply,
          vat_amount:     vat,
          amount:         supply + vat,
          description:    r.description.trim(),
          vat_type:       r.vatType,
          // vat_issued 컬럼 없음 — vat_type으로 통일
        }
        if (r.dbId) {
          await supabase.from('cash_flow_schedules').update(payload).eq('id', r.dbId)
        } else {
          await supabase.from('cash_flow_schedules').insert({ ...payload, is_completed: false, created_by: profile.id })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['project-revenue-schedules', project.id] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow'], exact: false })
      toast.success('현장 정보가 수정되었습니다')
      setEditMode(false)
      onClose()
    },
    onError: (e: any) => toast.error(`수정 실패: ${e?.message}`),
  })

  const deleteProject = useMutation({
    mutationFn: async () => {
      const pid = project.id
      // 현장과 관련된 모든 데이터 삭제
      // (cash_flow_schedules·transactions의 FK가 ON DELETE SET NULL이어도
      //  현장 삭제 시 관련 재무 데이터도 함께 완전 삭제하는 것이 올바른 동작)
      const deletes = [
        supabase.from('cash_flow_schedules').delete().eq('project_id', pid),
        supabase.from('transactions').delete().eq('project_id', pid),
        supabase.from('as_records').delete().eq('project_id', pid),
        supabase.from('daily_tasks').delete().eq('project_id', pid),
        supabase.from('schedules').delete().eq('project_id', pid),
        supabase.from('work_orders').delete().eq('project_id', pid),
      ]
      const results = await Promise.all(deletes)
      const firstErr = results.find(r => r.error)?.error
      if (firstErr) throw firstErr

      // 현장 삭제 (site_logs, payments는 CASCADE로 자동 삭제)
      const { error } = await supabase.from('projects').delete().eq('id', pid)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['as-pending'] })
      queryClient.invalidateQueries({ queryKey: ['as-done'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
      toast.success('현장 및 관련 데이터가 모두 삭제되었습니다')
      setShowDeleteConfirm(false)
      onClose()
    },
    onError: (e: any) => toast.error(`삭제 실패: ${e?.message}`),
  })

  const changeStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', project.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: false })
      toast.success('상태가 변경되었습니다')
      onClose()
    },
    onError: (e: any) => toast.error(`변경 실패: ${e?.message}`),
  })

  if (!project) return null

  const contractAmountDisplay = project.contract_amount
    ? `${project.contract_amount.toLocaleString()}원`
    : '-'

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setEditMode(false); setShowDeleteConfirm(false); onClose() } }}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 flex flex-col" style={{ maxHeight: '92dvh' }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={() => { setEditMode(false); onClose() }} className="text-[#007AFF] text-[16px]">
              {editMode ? '취소' : '닫기'}
            </button>
            <SheetTitle className="text-[17px] font-semibold">
              {editMode ? '현장 편집' : '현장 상세'}
            </SheetTitle>
            {isOwnerOrManager && (
              editMode ? (
                <button
                  onClick={() => updateProject.mutate()}
                  disabled={updateProject.isPending}
                  className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
                >
                  {updateProject.isPending ? '저장중...' : '저장'}
                </button>
              ) : (
                <button onClick={startEdit} className="text-[#007AFF] text-[16px] font-semibold">
                  편집
                </button>
              )
            )}
          </div>
        </SheetHeader>

        {editMode ? (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
            {/* 상태 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">상태</label>
              <div className="flex gap-2">
                {(['active', 'paused', 'completed', 'cancelled'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-[12px] font-medium border-2 transition-all',
                      status === s
                        ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                    )}
                  >
                    {PROJECT_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            {/* 현장명 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장명 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"

              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">주소</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="주소 (선택)"
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
              />
            </div>
            {/* 공용/세대 비밀번호 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">🔑 공용 비밀번호</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="공동현관 비번"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none tracking-widest"
                />
              </div>
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">🏠 세대 비밀번호</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={unitPassword}
                  onChange={(e) => setUnitPassword(e.target.value)}
                  placeholder="세대 현관 비번"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none tracking-widest"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">고객명</label>
                <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">연락처</label>
                <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(formatPhone(e.target.value))} className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">계약금액</label>
              <div className="relative">
                <input
                  type="text"
                  value={contractAmount}
                  onChange={(e) => {
                    const num = e.target.value.replace(/\D/g, '')
                    setContractAmount(num ? parseInt(num).toLocaleString() : '')
                  }}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">공사 기간</label>
              <div className="flex gap-2 items-center">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none" />
                <span className="text-[#8E8E93]">~</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">메모</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none resize-none"
              />
            </div>
            {/* 공사대금 결제일 편집 섹션 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">💰 공사대금 결제일</label>
              </div>
              {/* 기본 5개 자동 생성으로 빈 상태 없음 */}
              <div className="space-y-3">
                {editSchedules.map((s, idx) => (
                  <div key={s.localId} className="bg-[#F8F8FA] rounded-2xl p-3 border border-black/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-[#8E8E93]">
                        {s.description || `결제일 ${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditSchedules(prev => prev.filter(r => r.localId !== s.localId))}
                        className="text-[#FF3B30] active:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mb-2">
                      <label className="text-[11px] text-[#8E8E93] mb-1 block">날짜</label>
                      <input
                        type="date"
                        value={s.date}
                        onChange={(e) => updateEditSchedule(s.localId, 'date', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl text-[14px] text-black outline-none border border-black/5"
                      />
                    </div>
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <label className="text-[11px] text-[#8E8E93] mb-1 block">공급가액</label>
                        <div className="relative">
                          <input
                            type="text" inputMode="numeric"
                            value={s.supplyAmount}
                            onChange={(e) => handleEditSupplyChange(s.localId, e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 bg-white rounded-xl text-[14px] font-bold text-[#34C759] outline-none border border-black/5 pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#8E8E93]">원</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        {/* 부가세 + 발행 여부 체크박스 — vat_type 기반 */}
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-[#8E8E93]">부가세</label>
                          <label className="flex items-center gap-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={s.vatType === 'issued'}
                              onChange={(e) => handleEditVatTypeChange(s.localId, e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-[#007AFF]"
                            />
                            <span className="text-[10px] font-semibold text-[#007AFF]">발행</span>
                          </label>
                        </div>
                        <div className="relative">
                          <input
                            type="text" inputMode="numeric"
                            value={s.vatType === 'issued' ? s.vatAmount : '0 (미발행)'}
                            onChange={(e) => { if (s.vatType === 'issued') updateEditSchedule(s.localId, 'vatAmount', fmtAmt(e.target.value)) }}
                            disabled={s.vatType !== 'issued'}
                            placeholder="0"
                            className={cn(
                              'w-full px-3 py-2 rounded-xl text-[14px] outline-none border border-black/5 pr-6',
                              s.vatType === 'issued' ? 'bg-white text-black' : 'bg-[#F2F2F7]/50 text-[#C7C7CC] cursor-not-allowed'
                            )}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#8E8E93]">원</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8E8E93] mb-1 block">내용</label>
                      <input
                        type="text"
                        value={s.description}
                        onChange={(e) => updateEditSchedule(s.localId, 'description', e.target.value)}
                        placeholder="계약금, 중도금, 잔금 등"
                        className="w-full px-3 py-2 bg-white rounded-xl text-[14px] text-black outline-none border border-black/5"
                      />
                    </div>
                    {s.supplyAmount && (
                      <p className="text-[11px] text-[#8E8E93] mt-1.5">
                        합계: <span className="font-bold text-[#34C759]">
                          +{(
                            (parseInt(s.supplyAmount.replace(/,/g,''))||0) +
                            (s.vatType === 'issued' ? (parseInt((s.vatAmount||'').replace(/,/g,''))||0) : 0)
                          ).toLocaleString()}원
                        </span>
                        {s.vatType !== 'issued' && <span className="text-[10px] text-[#C7C7CC] ml-1">(부가세 미포함)</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditSchedules(prev => [...prev, newEditRow()])}
                className="mt-3 w-full py-3 rounded-xl border-2 border-dashed border-[#007AFF]/30 text-[#007AFF] text-[14px] font-semibold flex items-center justify-center gap-1.5 active:opacity-60"
              >
                <Plus className="w-4 h-4" />
                공사대금 결제일 추가
              </button>
            </div>

            <div className="pb-8" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
            {/* 상태 + 현장명 */}
            <div className="ios-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-[11px] px-2.5 py-1 rounded-full font-medium', statusColors[project.status])}>
                  {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
                </span>
              </div>
              <h2 className="text-[20px] font-bold text-black">{project.name}</h2>
              {project.description && (
                <p className="text-[13px] text-[#8E8E93] mt-1">{project.description}</p>
              )}
            </div>

            {/* 핵심 정보 */}
            <div className="ios-card divide-y divide-black/5 overflow-hidden">
              {project.address && (
                <div className="flex items-center gap-3 p-4">
                  <MapPin className="w-4 h-4 text-[#8E8E93] flex-shrink-0" />
                  <div>
                    <p className="text-[11px] text-[#8E8E93]">주소</p>
                    <p className="text-[14px] text-black">{project.address}</p>
                  </div>
                </div>
              )}
              {/* 비밀번호 정보 */}
              {(project.access_code || project.unit_password) && (
                <div className="flex items-start gap-3 p-4">
                  <span className="text-[16px] flex-shrink-0 mt-0.5">🔑</span>
                  <div className="flex-1 space-y-1">
                    {project.access_code && (
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] text-[#8E8E93]">공용 비밀번호</p>
                        <p className="text-[15px] font-bold text-black tracking-widest">{project.access_code}</p>
                      </div>
                    )}
                    {project.unit_password && (
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] text-[#8E8E93]">세대 비밀번호</p>
                        <p className="text-[15px] font-bold text-black tracking-widest">{project.unit_password}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {project.client_name && (
                <div className="flex items-center gap-3 p-4">
                  <Phone className="w-4 h-4 text-[#8E8E93] flex-shrink-0" />
                  <div>
                    <p className="text-[11px] text-[#8E8E93]">고객</p>
                    <p className="text-[14px] text-black">
                      {project.client_name}
                      {project.client_phone && (
                        <span className="text-[#007AFF] ml-2">{project.client_phone}</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-4">
                <DollarSign className="w-4 h-4 text-[#8E8E93] flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[#8E8E93]">계약금액</p>
                  <p className="text-[14px] font-semibold text-black">{contractAmountDisplay}</p>
                </div>
              </div>
              {(project.start_date || project.end_date) && (
                <div className="flex items-center gap-3 p-4">
                  <Calendar className="w-4 h-4 text-[#8E8E93] flex-shrink-0" />
                  <div>
                    <p className="text-[11px] text-[#8E8E93]">공사 기간</p>
                    <p className="text-[14px] text-black">
                      {project.start_date || '-'} ~ {project.end_date || '-'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 상태 변경 */}
            {isOwnerOrManager && (
              <div>
                <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-2">상태 변경</p>
                <div className="flex gap-2">
                  {(['active', 'paused', 'completed', 'cancelled'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => changeStatus.mutate(s)}
                      disabled={project.status === s || changeStatus.isPending}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-[12px] font-medium transition-all',
                        project.status === s
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-[#F2F2F7] text-[#8E8E93] active:opacity-60'
                      )}
                    >
                      {PROJECT_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 매출 스케줄 섹션 */}
            {revenueSchedules.length > 0 && (
              <div>
                <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-2">📥 매출 스케줄</p>
                <div className="ios-card divide-y divide-black/5 overflow-hidden">
                  {revenueSchedules.map((s: any) => {
                    const supply = Number(s.supply_amount) || Number(s.amount)
                    const vat    = Number(s.vat_amount) || 0
                    return (
                      <div key={s.id} className={cn('flex items-center justify-between px-4 py-3', s.is_completed && 'opacity-50')}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {s.is_completed && (
                              <span className="text-[10px] text-[#34C759] font-semibold bg-[#34C759]/10 px-1.5 py-0.5 rounded-full">✓ 완료</span>
                            )}
                          </div>
                          <p className={cn('text-[13px] font-medium text-black truncate', s.is_completed && 'line-through text-[#8E8E93]')}>
                            {s.description}
                          </p>
                          <p className="text-[11px] text-[#8E8E93] mt-0.5">{s.scheduled_date}</p>
                          {vat > 0 && (
                            <p className="text-[10px] text-[#C7C7CC]">공급가 {supply.toLocaleString()} + 부가세 {vat.toLocaleString()}</p>
                          )}
                        </div>
                        <p className={cn('text-[15px] font-bold ml-3 flex-shrink-0', s.is_completed ? 'text-[#C7C7CC]' : 'text-[#34C759]')}>
                          +{Number(s.amount).toLocaleString()}원
                        </p>
                      </div>
                    )
                  })}
                  {/* 합계 */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[#F2F2F7]">
                    <span className="text-[12px] font-medium text-[#3C3C43]">
                      합계 {revenueSchedules.length}건
                      {revenueSchedules.filter((s: any) => s.is_completed).length > 0 && (
                        <span className="text-[#34C759] ml-1">(완료 {revenueSchedules.filter((s: any) => s.is_completed).length}건)</span>
                      )}
                    </span>
                    <span className="text-[14px] font-bold text-[#34C759]">
                      +{revenueSchedules.reduce((s: number, r: any) => s + Number(r.amount), 0).toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 삭제 버튼 — 대표(owner)만 */}
            {isOwner && (
              <div>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 flex items-center justify-center gap-1.5 text-[#FF3B30] text-[15px] font-medium active:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    현장 삭제
                  </button>
                ) : (
                  <div className="bg-[#FFF2F0] rounded-xl p-4 border border-[#FF3B30]/15 space-y-3">
                    <p className="text-[14px] font-bold text-[#FF3B30] text-center">
                      ⚠️ '{project.name}' 현장 삭제
                    </p>
                    <p className="text-[12px] text-[#3C3C43] text-center leading-relaxed">
                      이 현장의 <span className="font-semibold text-[#FF3B30]">모든 데이터</span>가 영구 삭제됩니다
                    </p>
                    <ul className="text-[12px] text-[#8E8E93] space-y-0.5 px-2">
                      <li>• 원장 거래내역 (수금·결제·지출)</li>
                      <li>• 결제·매출 예정</li>
                      <li>• A/S 기록</li>
                      <li>• 현장일지 (사진 포함)</li>
                      <li>• 업무(태스크) 기록</li>
                      <li>• 공정표 일정</li>
                      <li>• 발주서</li>
                    </ul>
                    <p className="text-[11px] text-[#C7C7CC] text-center">삭제 후 복구 불가</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-2.5 bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium rounded-xl active:opacity-70"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => deleteProject.mutate()}
                        disabled={deleteProject.isPending}
                        className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[15px] font-semibold rounded-xl flex items-center justify-center gap-1.5 active:opacity-80 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleteProject.isPending ? '삭제중...' : '전체 삭제 확인'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pb-8" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
