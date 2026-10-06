'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/utils'
import { sendPushNotification } from '@/lib/usePushNotification'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

interface AddProjectSheetProps {
  open: boolean
  onClose: () => void
  profile: any
}

interface RevenueScheduleRow {
  id: string
  date: string
  supplyAmount: string
  vatAmount: string
  vatAuto: boolean   // 부가세 자동(10%) 체크박스
  memo: string       // 메모
  description: string
}

const DEFAULT_SCHEDULE_LABELS = ['계약금', '착수금', '중도금', '잔금', '추가공사 금액']

function newScheduleRow(label = ''): RevenueScheduleRow {
  return {
    id: Math.random().toString(36).slice(2),
    date: format(new Date(), 'yyyy-MM-dd'),
    supplyAmount: '',
    vatAmount: '',
    vatAuto: false,
    memo: '',
    description: label,
  }
}

function makeDefaultSchedules(): RevenueScheduleRow[] {
  return DEFAULT_SCHEDULE_LABELS.map(label => newScheduleRow(label))
}

export function AddProjectSheet({ open, onClose, profile }: AddProjectSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [unitPassword, setUnitPassword] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractAmount, setContractAmount] = useState('')
  const [vatType, setVatType] = useState<'included' | 'excluded' | 'none'>('excluded')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [schedules, setSchedules] = useState<RevenueScheduleRow[]>(makeDefaultSchedules)

  const addProject = useMutation({
    mutationFn: async () => {
      // 1) 현장 INSERT
      const { data: projectData, error } = await supabase.from('projects').insert({
        company_id: profile.company_id,
        name: name.trim(),
        address: address.trim() || null,
        access_code: accessCode.trim() || null,
        unit_password: unitPassword.trim() || null,
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        contract_amount: contractAmount ? parseInt(contractAmount.replace(/,/g, '')) : 0,
        vat_type: vatType,
        start_date: startDate || null,
        end_date: endDate || null,
        description: description.trim() || null,
        status: 'active',
        created_by: profile.id,
      }).select('id').single()
      if (error) throw error

      // 2) 결제스케줄 INSERT — 금액이 입력된 행만 저장
      const validSchedules = schedules.filter(s => {
        const supply = parseInt(s.supplyAmount.replace(/,/g, '')) || 0
        return supply > 0 && s.date
      })
      if (validSchedules.length > 0) {
        const rows = validSchedules.map(s => {
          const supply = parseInt(s.supplyAmount.replace(/,/g, '')) || 0
          const vat    = parseInt(s.vatAmount.replace(/,/g, '')) || 0
          return {
            company_id:     profile.company_id,
            project_id:     projectData.id,
            flow_type:      'revenue' as const,
            scheduled_date: s.date,
            supply_amount:  supply,
            vat_amount:     vat,
            amount:         supply + vat,
            description:    s.description.trim() || s.memo.trim() || '공사대금',
            is_completed:   false,
            created_by:     profile.id,
          }
        })
        const { error: schErr } = await supabase.from('cash_flow_schedules').insert(rows)
        if (schErr) {
          // 스케줄 저장 실패 시 생성된 현장도 롤백 삭제
          await supabase.from('projects').delete().eq('id', projectData.id)
          throw schErr
        }
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-flow'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['dashboard-revenues'], exact: false })
      toast.success('현장이 등록되었습니다')

      // 푸시 알림
      try {
        sendPushNotification({
          companyId: profile.company_id,
          excludeUserId: profile.id,
          title: '🏗️ 신규현장 등록',
          body: `${profile.name}님이 새 현장을 등록했습니다: ${name.trim()}`,
          url: '/projects',
          tag: 'project-new',
        })
      } catch (err) {
        console.warn('[AddProjectSheet] 푸시 알림 발송 실패:', err)
      }

      handleClose()
    },
    onError: (e: any) => toast.error(`등록 실패: ${e?.message || '다시 시도해주세요'}`),
  })

  const handleClose = () => {
    setName('')
    setAddress('')
    setAccessCode('')
    setUnitPassword('')
    setClientName('')
    setClientPhone('')
    setContractAmount('')
    setVatType('excluded')
    setStartDate('')
    setEndDate('')
    setDescription('')
    setSchedules(makeDefaultSchedules())
    onClose()
  }

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('현장명을 입력해주세요'); return }
    // 금액이 입력된 행만 저장 대상 — 날짜 필수 체크
    const filledRows = schedules.filter(s => {
      const supply = parseInt(s.supplyAmount.replace(/,/g, '')) || 0
      return supply > 0
    })
    const missingDate = filledRows.find(s => !s.date)
    if (missingDate) { toast.error('날짜를 입력해주세요'); return }
    addProject.mutate()
  }

  const formatAmount = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  // 스케줄 행 업데이트 헬퍼
  const updateSchedule = (id: string, key: keyof RevenueScheduleRow, value: string) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s))
  }

  const handleSupplyChange = (id: string, v: string) => {
    const raw = v.replace(/\D/g, '')
    const num = parseInt(raw) || 0
    setSchedules(prev => prev.map(s => s.id === id ? {
      ...s,
      supplyAmount: raw ? num.toLocaleString() : '',
      vatAmount: s.vatAuto && raw ? Math.round(num * 0.1).toLocaleString() : s.vatAmount,
    } : s))
  }

  const handleVatAutoToggle = (id: string, checked: boolean) => {
    setSchedules(prev => prev.map(s => {
      if (s.id !== id) return s
      const num = parseInt(s.supplyAmount.replace(/,/g, '')) || 0
      return {
        ...s,
        vatAuto: checked,
        vatAmount: checked && num > 0 ? Math.round(num * 0.1).toLocaleString() : s.vatAmount,
      }
    }))
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* 헤더 - 고정 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">현장 등록</SheetTitle>
            <button
              onClick={handleSubmit}
              disabled={addProject.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {addProject.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* 스크롤 가능한 폼 영역 */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* 현장명 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 강남구 논현동 인테리어"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 주소 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">주소</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="현장 주소 (선택)"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 공용 비밀번호 + 세대 비밀번호 */}
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

          {/* 고객 정보 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">고객명</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="고객 이름"
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">연락처</label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
              />
            </div>
          </div>

          {/* 계약금액 + 부가세 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">계약금액</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(formatAmount(e.target.value))}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
              </div>
              <select
                value={vatType}
                onChange={(e) => setVatType(e.target.value as any)}
                className="px-3 py-3 bg-[#F2F2F7] rounded-xl text-[13px] text-black outline-none"
              >
                <option value="excluded">VAT 별도</option>
                <option value="included">VAT 포함</option>
                <option value="none">VAT 없음</option>
              </select>
            </div>
          </div>

          {/* 공사 기간 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">공사 기간</label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
              />
              <span className="text-[#8E8E93] text-[13px]">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">메모</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="현장 관련 메모 (선택)"
              rows={3}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
            />
          </div>

          {/* ── 공사대금 결제일 섹션 ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">💰 공사대금 결제일</label>
            </div>
            <div className="space-y-4">
              {schedules.map((s, idx) => (
                <div key={s.id} className="bg-[#F8F8FA] rounded-2xl border border-black/5 overflow-hidden">
                  {/* 항목 헤더 */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#E5E5EA]/60 border-b border-black/5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#007AFF] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={s.description}
                        onChange={(e) => updateSchedule(s.id, 'description', e.target.value)}
                        placeholder="항목명"
                        className="text-[14px] font-bold text-black bg-transparent outline-none w-32"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSchedules(prev => prev.filter(r => r.id !== s.id))}
                      className="text-[#FF3B30] active:opacity-60 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* ① 날짜 — 연 월 일 */}
                    <div>
                      <label className="text-[11px] text-[#8E8E93] font-medium mb-1.5 block">날짜</label>
                      <input
                        type="date"
                        value={s.date}
                        onChange={(e) => updateSchedule(s.id, 'date', e.target.value)}
                        className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] text-black outline-none border border-black/8"
                      />
                    </div>

                    {/* ② 공급가 */}
                    <div>
                      <label className="text-[11px] text-[#8E8E93] font-medium mb-1.5 block">공급가</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={s.supplyAmount}
                          onChange={(e) => handleSupplyChange(s.id, e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2.5 bg-white rounded-xl text-[15px] font-bold text-[#34C759] outline-none border border-black/8 pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8E8E93]">원</span>
                      </div>
                    </div>

                    {/* ③ 부가세 + 체크박스 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] text-[#8E8E93] font-medium">부가세</label>
                        {/* 체크박스 — 공급가의 10% 자동 입력 */}
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <div
                            onClick={() => handleVatAutoToggle(s.id, !s.vatAuto)}
                            className={`w-9 h-5 rounded-full relative transition-all cursor-pointer ${s.vatAuto ? 'bg-[#007AFF]' : 'bg-[#E5E5EA]'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${s.vatAuto ? 'left-[18px]' : 'left-0.5'}`} />
                          </div>
                          <span className="text-[11px] text-[#8E8E93]">공급가 10% 자동</span>
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={s.vatAmount}
                          onChange={(e) => !s.vatAuto && updateSchedule(s.id, 'vatAmount', formatAmount(e.target.value))}
                          readOnly={s.vatAuto}
                          placeholder="0"
                          className={`w-full px-3 py-2.5 rounded-xl text-[15px] outline-none border border-black/8 pr-8 ${s.vatAuto ? 'bg-[#007AFF]/5 text-[#007AFF] font-semibold' : 'bg-white text-black'}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8E8E93]">원</span>
                      </div>
                    </div>

                    {/* ④ 메모 */}
                    <div>
                      <label className="text-[11px] text-[#8E8E93] font-medium mb-1.5 block">메모</label>
                      <input
                        type="text"
                        value={s.memo}
                        onChange={(e) => updateSchedule(s.id, 'memo', e.target.value)}
                        placeholder="메모 (선택)"
                        className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] text-black outline-none border border-black/8"
                      />
                    </div>

                    {/* 합계 */}
                    {s.supplyAmount && (
                      <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-between border border-[#34C759]/20">
                        <span className="text-[12px] text-[#8E8E93]">합계</span>
                        <span className="text-[14px] font-bold text-[#34C759]">
                          +{((parseInt(s.supplyAmount.replace(/,/g, '')) || 0) + (parseInt(s.vatAmount.replace(/,/g, '')) || 0)).toLocaleString()}원
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* 항목 추가 버튼 */}
            <button
              type="button"
              onClick={() => setSchedules(prev => [...prev, newScheduleRow()])}
              className="mt-3 w-full py-3 rounded-xl border-2 border-dashed border-[#007AFF]/30 text-[#007AFF] text-[14px] font-semibold flex items-center justify-center gap-1.5 active:opacity-60"
            >
              <Plus className="w-4 h-4" />
              항목 추가
            </button>
          </div>

          {/* 하단 여백 */}
          <div className="pb-10" />
        </div>

        {/* 하단 저장 버튼 - 항상 보임 */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-black/5 bg-white">
          <button
            onClick={handleSubmit}
            disabled={addProject.isPending}
            className="w-full py-3.5 bg-[#007AFF] text-white text-[16px] font-semibold rounded-xl disabled:opacity-40 active:opacity-80"
          >
            {addProject.isPending ? '저장 중...' : '현장 등록'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

