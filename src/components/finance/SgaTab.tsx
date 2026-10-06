'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown } from 'lucide-react'

interface SgaTabProps {
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
}

// ─────────────────────────────────────────────────────────
// 오버라이드 누적 적용 헬퍼
// targetMonth: 'YYYY-MM' 형식
// baseItems: recurring_expenses 에서 가져온 원본 고정비 목록
// overrides: recurring_expense_overrides 전체 목록 (해당 회사)
// 반환: 해당 달 기준으로 적용된 최종 항목 배열
// ─────────────────────────────────────────────────────────
function getEffectiveFixedItems(baseItems: any[], overrides: any[], targetMonth: string): any[] {
  // targetMonth 이하의 오버라이드만 필터 (해당 달까지 누적)
  const applicable = overrides
    .filter((o) => o.effective_month <= targetMonth)
    .sort((a, b) => a.effective_month.localeCompare(b.effective_month))

  // base items 복사 (Map: expense_id → item)
  const itemMap = new Map<string, any>()
  for (const item of baseItems) {
    itemMap.set(item.id, { ...item })
  }
  // add 전용: 오버라이드 id → virtual item 보관
  const addedMap = new Map<string, any>()

  for (const o of applicable) {
    if (o.action === 'delete') {
      if (o.expense_id) {
        itemMap.delete(o.expense_id)
        addedMap.delete(o.expense_id)
      }
    } else if (o.action === 'update') {
      if (o.expense_id) {
        const existing = itemMap.get(o.expense_id) || addedMap.get(o.expense_id)
        if (existing) {
          const updated = {
            ...existing,
            name: o.name ?? existing.name,
            amount: o.amount ?? existing.amount,
            billing_day: o.billing_day ?? existing.billing_day,
            memo: o.memo !== undefined ? o.memo : existing.memo,
          }
          if (itemMap.has(o.expense_id)) itemMap.set(o.expense_id, updated)
          else addedMap.set(o.expense_id, updated)
        }
      }
    } else if (o.action === 'add') {
      // expense_id 는 null — override id 를 가상 키로 사용
      const virtualId = `override_${o.id}`
      addedMap.set(virtualId, {
        id: virtualId,
        override_id: o.id,
        name: o.name ?? '신규항목',
        amount: o.amount ?? 0,
        billing_day: o.billing_day ?? 25,
        memo: o.memo ?? null,
        is_override: true,
      })
    }
  }

  const result = [
    ...Array.from(itemMap.values()),
    ...Array.from(addedMap.values()),
  ]
  result.sort((a, b) => (a.billing_day ?? 99) - (b.billing_day ?? 99))
  return result
}

// ─────────────────────────────────────────────────────────
// 고정비 항목관리 모달 — 수정/추가/삭제 + 월별 오버라이드
// ─────────────────────────────────────────────────────────
function FixedManageSheet({
  open,
  onClose,
  profile,
  monthStart,
  baseItems,
  effectiveItems,
  overrides,
  currentMonthKey,
}: {
  open: boolean
  onClose: () => void
  profile: any
  monthStart: string
  baseItems: any[]
  effectiveItems: any[]
  overrides: any[]
  currentMonthKey: string  // YYYY-MM
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editBillingDay, setEditBillingDay] = useState<number>(25)
  const [editMemo, setEditMemo] = useState('')

  // 삭제 확인 상태 (인라인 confirm UI)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // 항목 추가 상태
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addBillingDay, setAddBillingDay] = useState<number>(25)
  const [addMemo, setAddMemo] = useState('')
  const [addFromMonth, setAddFromMonth] = useState(currentMonthKey)

  const fmt = (v: string) => {
    const n = v.replace(/\D/g, '')
    return n ? parseInt(n).toLocaleString() : ''
  }

  // 월 목록 생성 (현재 달 ~ +12개월)
  const monthOptions = Array.from({ length: 13 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + i)
    return format(d, 'yyyy-MM')
  })

  const openEdit = (item: any) => {
    setEditingId(item.id)
    setEditName(item.name ?? '')
    setEditAmount(Number(item.amount).toLocaleString())
    setEditBillingDay(item.billing_day ?? 25)
    setEditMemo(item.memo ?? '')
    setDeleteConfirmId(null)
    setShowAdd(false)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
    queryClient.invalidateQueries({ queryKey: ['recurring-overrides', profile.company_id] })
    queryClient.invalidateQueries({ queryKey: ['sga-summary', profile.company_id, monthStart] })
  }

  // 수정 저장
  // scope: 'from_now' = 이번달부터 오버라이드, 'all' = 원본 직접 수정(전체 소급)
  const editMutation = useMutation({
    mutationFn: async ({ item, scope }: { item: any; scope: 'from_now' | 'all' }) => {
      const num = parseInt(editAmount.replace(/,/g, ''))
      if (!editName.trim()) throw new Error('항목명을 입력해주세요')
      if (!num || num <= 0) throw new Error('금액을 입력해주세요')

      const isOverrideItem = item.id?.startsWith('override_')

      if (scope === 'all') {
        // 전체 소급: 원본 recurring_expenses 직접 수정
        if (isOverrideItem) {
          // add override 항목 → override 레코드 자체를 수정
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .update({
              name: editName.trim(),
              amount: num,
              billing_day: editBillingDay,
              memo: editMemo.trim() || null,
            })
            .eq('id', item.override_id)
          if (error) throw error
        } else {
          // base item → 원본 직접 수정
          const { error } = await supabase
            .from('recurring_expenses')
            .update({
              name: editName.trim(),
              amount: num,
              billing_day: editBillingDay,
              memo: editMemo.trim() || null,
            })
            .eq('id', item.id)
          if (error) throw error
          // 기존 update override 있으면 같이 제거 (원본으로 통일)
          await supabase
            .from('recurring_expense_overrides')
            .delete()
            .eq('expense_id', item.id)
            .eq('action', 'update')
        }
      } else {
        // 이번달부터: 오버라이드 저장
        if (isOverrideItem) {
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .update({
              name: editName.trim(),
              amount: num,
              billing_day: editBillingDay,
              memo: editMemo.trim() || null,
              effective_month: currentMonthKey,
            })
            .eq('id', item.override_id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .upsert({
              company_id: profile.company_id,
              effective_month: currentMonthKey,
              expense_id: item.id,
              action: 'update',
              name: editName.trim(),
              amount: num,
              billing_day: editBillingDay,
              memo: editMemo.trim() || null,
              created_by: profile.id,
            }, {
              onConflict: 'company_id,effective_month,expense_id,action',
              ignoreDuplicates: false,
            })
          if (error) throw error
        }
      }
    },
    onSuccess: () => { invalidate(); toast.success('수정되었습니다'); setEditingId(null) },
    onError: (e: any) => toast.error(e.message),
  })

  // 삭제
  // scope: 'from_now' = 이번달부터 숨김(오버라이드), 'all' = 원본 완전삭제(is_active=false)
  const deleteMutation = useMutation({
    mutationFn: async ({ item, scope }: { item: any; scope: 'from_now' | 'all' }) => {
      const isOverrideItem = item.id?.startsWith('override_')

      if (scope === 'all') {
        // 전체 소급 삭제: 원본 is_active=false
        if (isOverrideItem) {
          // add override 항목 자체를 DB에서 제거
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .delete()
            .eq('id', item.override_id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('recurring_expenses')
            .update({ is_active: false })
            .eq('id', item.id)
          if (error) throw error
          // 관련 override도 모두 제거
          await supabase
            .from('recurring_expense_overrides')
            .delete()
            .eq('expense_id', item.id)
        }
      } else {
        // 이번달부터 삭제: delete override 저장
        if (isOverrideItem) {
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .delete()
            .eq('id', item.override_id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('recurring_expense_overrides')
            .upsert({
              company_id: profile.company_id,
              effective_month: currentMonthKey,
              expense_id: item.id,
              action: 'delete',
              created_by: profile.id,
            }, {
              onConflict: 'company_id,effective_month,expense_id,action',
              ignoreDuplicates: false,
            })
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success('삭제되었습니다')
      setEditingId(null)
      setDeleteConfirmId(null)
    },
  })

  // 신규 항목 추가
  // scope: 'from_now' = 이번달부터 오버라이드, 'all' = 원본 recurring_expenses에 직접 INSERT
  const addMutation = useMutation({
    mutationFn: async (scope: 'from_now' | 'all') => {
      if (!addName.trim()) throw new Error('항목명을 입력해주세요')
      const num = parseInt(addAmount.replace(/,/g, ''))
      if (!num || num <= 0) throw new Error('금액을 입력해주세요')

      if (scope === 'all') {
        // 전체 소급: 원본 테이블에 직접 추가 (모든 달에 반영)
        const { error } = await supabase.from('recurring_expenses').insert({
          company_id: profile.company_id,
          name: addName.trim(),
          expense_type: 'fixed',
          sub_category: 'SGA',
          amount: num,
          billing_day: addBillingDay,
          memo: addMemo.trim() || null,
          is_active: true,
          created_by: profile.id,
        })
        if (error) throw error
      } else {
        // 이번달부터: override add 저장
        const { error } = await supabase.from('recurring_expense_overrides').insert({
          company_id: profile.company_id,
          effective_month: currentMonthKey,
          expense_id: null,
          action: 'add',
          name: addName.trim(),
          amount: num,
          billing_day: addBillingDay,
          memo: addMemo.trim() || null,
          created_by: profile.id,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success('추가되었습니다')
      setShowAdd(false)
      setAddName(''); setAddAmount(''); setAddBillingDay(25); setAddMemo('')
    },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
            <SheetTitle className="text-[17px] font-semibold">📌 고정비 항목 관리</SheetTitle>
            <button
              onClick={() => { setShowAdd((p) => !p); setEditingId(null) }}
              className="text-[#007AFF] text-[16px] font-semibold"
            >
              {showAdd ? '취소' : '+ 추가'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

          {/* 새 항목 추가 폼 */}
          {showAdd && (
            <div className="bg-[#F2F2F7] rounded-xl p-4 space-y-3">
              <p className="text-[13px] font-bold text-[#1C1C1E]">새 고정비 항목 추가</p>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="항목명 (예: 직원 급여)"
                className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none"
                autoFocus
              />
              <div className="relative">
                <input
                  type="text" inputMode="numeric"
                  value={addAmount}
                  onChange={(e) => setAddAmount(fmt(e.target.value))}
                  placeholder="월 금액"
                  className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
              </div>
              <select
                value={addBillingDay}
                onChange={(e) => setAddBillingDay(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none appearance-none"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>매월 {d}일</option>
                ))}
              </select>
              <input
                type="text"
                value={addMemo}
                onChange={(e) => setAddMemo(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => addMutation.mutate('from_now')}
                  disabled={addMutation.isPending}
                  className="flex-1 py-2.5 bg-[#FF9500] text-white rounded-xl text-[13px] font-bold disabled:opacity-50"
                >
                  이번달부터
                </button>
                <button
                  onClick={() => addMutation.mutate('all')}
                  disabled={addMutation.isPending}
                  className="flex-1 py-2.5 bg-[#5856D6] text-white rounded-xl text-[13px] font-bold disabled:opacity-50"
                >
                  전체 소급
                </button>
              </div>
            </div>
          )}

          {/* 항목 리스트 */}
          {effectiveItems.length === 0 ? (
            <div className="text-center py-10 text-[#8E8E93] text-[14px]">항목이 없어요</div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden border border-black/5">
              {effectiveItems.map((item: any, idx: number) => {
                const isEditing = editingId === item.id
                const isOverrideAdded = item.is_override === true
                return (
                  <div key={item.id} className={cn(idx < effectiveItems.length - 1 && 'border-b border-black/5')}>

                    {/* 항목 행 */}
                    <div className="flex items-center px-4 py-3.5 gap-3">
                      {/* 날짜 뱃지 */}
                      <div className="w-9 h-9 rounded-xl bg-[#5856D6]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-[#5856D6]">{item.billing_day}일</span>
                      </div>
                      {/* 항목명 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{item.name}</p>
                          {isOverrideAdded && (
                            <span className="text-[10px] bg-[#FF9500]/15 text-[#FF9500] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">추가됨</span>
                          )}
                        </div>
                        {item.memo && <p className="text-[11px] text-[#8E8E93] truncate">{item.memo}</p>}
                      </div>
                      {/* 금액 */}
                      <p className="text-[14px] font-bold text-[#5856D6] flex-shrink-0">
                        {Number(item.amount).toLocaleString()}원
                      </p>
                      {/* 수정 토글 버튼 */}
                      <button
                        onClick={() => isEditing ? setEditingId(null) : openEdit(item)}
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                          isEditing ? 'bg-[#F2F2F7] text-[#8E8E93]' : 'bg-[#5856D6]/10 text-[#5856D6]'
                        )}
                      >
                        {isEditing ? (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 2L11 11M11 2L2 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M8.5 2L11 4.5L4.5 11H2V8.5L8.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      {/* 삭제 버튼 */}
                      {!isEditing && (
                        <button
                          onClick={() => setDeleteConfirmId(deleteConfirmId === item.id ? null : item.id)}
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                            deleteConfirmId === item.id
                              ? 'bg-[#FF3B30] text-white'
                              : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                          )}
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* 삭제 확인 UI */}
                    {deleteConfirmId === item.id && !isEditing && (
                      <div className="mx-4 mb-3 bg-[#FFF2F0] rounded-xl p-3 border border-[#FF3B30]/15">
                        <p className="text-[13px] font-semibold text-[#1C1C1E] mb-2">
                          '{item.name}' 삭제 범위를 선택하세요
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="py-2 px-3 bg-white rounded-xl text-[12px] text-[#8E8E93] border border-black/8"
                          >취소</button>
                          <button
                            onClick={() => deleteMutation.mutate({ item, scope: 'from_now' })}
                            disabled={deleteMutation.isPending}
                            className="flex-1 py-2 bg-[#FF9500] text-white rounded-xl text-[12px] font-bold disabled:opacity-50"
                          >이번달부터</button>
                          <button
                            onClick={() => deleteMutation.mutate({ item, scope: 'all' })}
                            disabled={deleteMutation.isPending}
                            className="flex-1 py-2 bg-[#FF3B30] text-white rounded-xl text-[12px] font-bold disabled:opacity-50"
                          >전체 소급</button>
                        </div>
                      </div>
                    )}

                    {/* 인라인 수정 폼 */}
                    {isEditing && (
                      <div className="mx-4 mb-3 bg-[#F8F8FF] rounded-xl p-3 space-y-2.5 border border-[#5856D6]/15">
                        {/* 항목명 수정 */}
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="항목명"
                          autoFocus
                          className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] font-semibold outline-none border border-[#5856D6]/20"
                        />
                        {/* 금액 수정 */}
                        <div className="relative">
                          <input
                            type="text" inputMode="numeric"
                            value={editAmount}
                            onChange={(e) => setEditAmount(fmt(e.target.value))}
                            placeholder="월 금액"
                            className="w-full px-3 py-2.5 bg-white rounded-xl text-[15px] font-bold text-[#5856D6] outline-none pr-8 border border-[#5856D6]/20"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
                        </div>
                        {/* 날짜 */}
                        <select
                          value={editBillingDay}
                          onChange={(e) => setEditBillingDay(parseInt(e.target.value))}
                          className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none appearance-none border border-black/8"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>매월 {d}일</option>
                          ))}
                        </select>
                        {/* 메모 */}
                        <input
                          type="text"
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          placeholder="메모 (선택)"
                          className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none border border-black/8"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="py-2 px-3 bg-white rounded-xl text-[13px] text-[#8E8E93] border border-black/8"
                          >취소</button>
                          <button
                            onClick={() => editMutation.mutate({ item, scope: 'from_now' })}
                            disabled={editMutation.isPending}
                            className="flex-1 py-2 bg-[#FF9500] text-white rounded-xl text-[12px] font-bold disabled:opacity-50"
                          >이번달부터</button>
                          <button
                            onClick={() => editMutation.mutate({ item, scope: 'all' })}
                            disabled={editMutation.isPending}
                            className="flex-1 py-2 bg-[#5856D6] text-white rounded-xl text-[12px] font-bold disabled:opacity-50"
                          >전체 소급</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 안내 문구 */}
          <div className="bg-[#F2F2F7] rounded-xl px-4 py-3 space-y-1">
            <p className="text-[12px] text-[#6C6C70] leading-relaxed">
              🟡 <strong>이번달부터</strong> — 이번 달부터만 적용 (이전 달 유지)
            </p>
            <p className="text-[12px] text-[#6C6C70] leading-relaxed">
              🟣 <strong>전체 소급</strong> — 1월부터 모든 달에 즉시 반영
            </p>
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────
// 변동비 항목관리 모달 (추가 / 삭제)
// ─────────────────────────────────────────────────────────
function VariableManageSheet({
  open,
  onClose,
  profile,
  items,
}: {
  open: boolean
  onClose: () => void
  profile: any
  items: any[]
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!addName.trim()) throw new Error('항목명을 입력해주세요')
      const { error } = await supabase.from('recurring_expenses').insert({
        company_id: profile.company_id,
        name: addName.trim(),
        expense_type: 'variable',
        sub_category: 'SGA',
        amount: 0,
        is_active: true,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('추가되었습니다')
      setShowAdd(false)
      setAddName('')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('삭제되었습니다') },
  })

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
            <SheetTitle className="text-[17px] font-semibold">📊 변동비 항목 관리</SheetTitle>
            <button
              onClick={() => setShowAdd((p) => !p)}
              className="text-[#007AFF] text-[16px] font-semibold"
            >
              {showAdd ? '취소' : '+ 추가'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

          {/* 항목 추가 폼 */}
          {showAdd && (
            <div className="bg-[#F2F2F7] rounded-xl p-4 space-y-3">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="항목명 (예: 경조사비)"
                className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none"
                autoFocus
              />
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="w-full py-2.5 bg-[#FF6B35] text-white rounded-xl text-[14px] font-bold disabled:opacity-50"
              >
                추가
              </button>
            </div>
          )}

          <p className="text-[12px] text-[#8E8E93] px-1">항목 오른쪽 ✕를 눌러 삭제하세요</p>

          {/* 항목 리스트 */}
          {items.length === 0 ? (
            <div className="text-center py-10 text-[#8E8E93] text-[14px]">항목이 없어요</div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden border border-black/5">
              {items.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center px-4 py-3.5 gap-3',
                    idx < items.length - 1 && 'border-b border-black/5'
                  )}
                >
                  <p className="flex-1 text-[14px] font-semibold text-[#1C1C1E]">{item.name}</p>
                  <button
                    onClick={() => {
                      if (confirm(`'${item.name}' 항목을 삭제할까요?`)) {
                        deleteMutation.mutate(item.id)
                      }
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-[#FF3B30]/10 text-[#FF3B30] flex-shrink-0"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────
// 상세 Sheet - 고정비 (리스트만, 수정은 FixedManageSheet에서)
// ─────────────────────────────────────────────────────────
function FixedDetailSheet({
  open,
  onClose,
  profile,
  monthStart,
  monthEnd,
  currentMonth,
}: {
  open: boolean
  onClose: () => void
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
}) {
  const supabase = createClient()
  const [showManage, setShowManage] = useState(false)
  const currentMonthKey = format(currentMonth, 'yyyy-MM')

  // base 고정비 항목
  const { data: baseItems = [], isLoading } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, 'fixed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
        .order('billing_day', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: open,
  })

  // 오버라이드 전체 조회
  const { data: overrides = [] } = useQuery({
    queryKey: ['recurring-overrides', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expense_overrides')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('effective_month', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: open,
  })

  // 현재 달 기준 효과적인 항목 계산
  const effectiveItems = getEffectiveFixedItems(baseItems, overrides, currentMonthKey)
  const totalFixed = effectiveItems.reduce((s: number, i: any) => s + Number(i.amount), 0)

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0 flex flex-col"
          style={{ maxHeight: '92dvh' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-5 pb-3 border-b border-black/5">
            <div className="flex items-center justify-between">
              <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
              <SheetTitle className="text-[17px] font-semibold">📌 고정비 상세</SheetTitle>
              <button
                onClick={() => setShowManage(true)}
                className="text-[#007AFF] text-[16px] font-semibold"
              >
                수정
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

            {/* 월 합계 */}
            <div className="bg-[#5856D6]/10 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-[13px] font-semibold text-[#5856D6]">
                📌 {format(currentMonth, 'M월', { locale: ko })} 고정비 합계
              </span>
              <span className="text-[18px] font-bold text-[#5856D6]">{totalFixed.toLocaleString()}원</span>
            </div>

            {/* 항목 목록 */}
            {isLoading ? (
              <div className="text-center py-8 text-[#8E8E93] text-[14px]">불러오는 중...</div>
            ) : effectiveItems.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[32px] mb-2">📌</p>
                <p className="text-[14px] font-semibold text-[#1C1C1E]">고정비 항목이 없어요</p>
                <p className="text-[12px] text-[#8E8E93] mt-1">우측 수정 버튼으로 항목을 추가하세요</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl overflow-hidden border border-black/5">
                {effectiveItems.map((item: any, idx: number) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center px-4 py-3.5 gap-3',
                      idx < effectiveItems.length - 1 && 'border-b border-black/5'
                    )}
                  >
                    {/* 날짜 뱃지 */}
                    <div className="w-9 h-9 rounded-xl bg-[#5856D6]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-bold text-[#5856D6]">{item.billing_day}일</span>
                    </div>
                    {/* 항목명 + 메모 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{item.name}</p>
                        {item.is_override && (
                          <span className="text-[10px] bg-[#FF9500]/15 text-[#FF9500] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">변경됨</span>
                        )}
                      </div>
                      {item.memo && (
                        <p className="text-[11px] text-[#8E8E93] truncate mt-0.5">{item.memo}</p>
                      )}
                    </div>
                    {/* 금액 */}
                    <p className={cn(
                      'text-[14px] font-bold flex-shrink-0',
                      Number(item.amount) > 0 ? 'text-[#5856D6]' : 'text-[#C7C7CC]'
                    )}>
                      {Number(item.amount) > 0 ? `${Number(item.amount).toLocaleString()}원` : '미입력'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="pb-8" />
          </div>
        </SheetContent>
      </Sheet>

      {/* 항목 관리 모달 */}
      <FixedManageSheet
        open={showManage}
        onClose={() => setShowManage(false)}
        profile={profile}
        monthStart={monthStart}
        baseItems={baseItems}
        effectiveItems={effectiveItems}
        overrides={overrides}
        currentMonthKey={currentMonthKey}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────
// 상세 Sheet - 변동비
// ─────────────────────────────────────────────────────────
function VariableDetailSheet({
  open,
  onClose,
  profile,
  monthStart,
  monthEnd,
  currentMonth,
}: {
  open: boolean
  onClose: () => void
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 항목 관리 모달
  const [showManage, setShowManage] = useState(false)

  // 수정 중인 거래 id
  const [editTxId, setEditTxId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editPayment, setEditPayment] = useState('transfer')

  // 변동비 항목 목록
  const { data: variableItems = [] } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, 'variable'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'variable')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: open,
  })

  // 이번 달 변동비 거래 내역
  const { data: monthlyTx = [] } = useQuery({
    queryKey: ['variable-tx', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, sub_category, amount, supply_amount, description, transaction_date, payment_method')
        .eq('company_id', profile.company_id)
        .eq('category', 'SGA')
        .eq('is_voided', false)
        .eq('is_internal_transfer', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return (data || []).filter((t: any) => !t.description?.startsWith('[정기]'))
    },
    enabled: open,
  })

  // 항목별 이번 달 합계
  const txByItem = monthlyTx.reduce((acc: Record<string, number>, t: any) => {
    const key = t.sub_category || '기타'
    acc[key] = (acc[key] || 0) + Number(t.amount)
    return acc
  }, {})

  // 금액 있는 항목 상단 정렬
  const sortedItems = [...variableItems].sort((a: any, b: any) => {
    const aAmt = txByItem[a.name] || 0
    const bAmt = txByItem[b.name] || 0
    if (bAmt !== aAmt) return bAmt - aAmt
    return a.name.localeCompare(b.name, 'ko')
  })

  // 기입 저장
  const fmt = (v: string) => {
    const n = v.replace(/\D/g, '')
    return n ? parseInt(n).toLocaleString() : ''
  }

  const invalidateTx = () => {
    queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['variable-tx', profile.company_id, monthStart, monthEnd] })
    queryClient.invalidateQueries({ queryKey: ['sga-summary', profile.company_id, monthStart] })
  }

  // 거래 수정
  const updateMutation = useMutation({
    mutationFn: async (txId: string) => {
      const numAmount = parseInt(editAmount.replace(/,/g, ''))
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!editDesc.trim()) throw new Error('적요를 입력해주세요')
      const { error } = await supabase.from('transactions').update({
        amount: numAmount,
        supply_amount: numAmount,
        description: editDesc.trim(),
        transaction_date: editDate,
        payment_method: editPayment,
      }).eq('id', txId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateTx()
      toast.success('수정되었습니다')
      setEditTxId(null)
    },
    onError: (e: any) => toast.error(e.message),
  })

  // 거래 삭제 (void)
  const voidMutation = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from('transactions').update({ is_voided: true }).eq('id', txId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateTx()
      toast.success('삭제되었습니다')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const openEdit = (t: any) => {
    setEditTxId(t.id)
    setEditAmount(Number(t.amount).toLocaleString())
    setEditDesc(t.description || '')
    setEditDate(t.transaction_date)
    setEditPayment(t.payment_method || 'transfer')
  }

  const totalVariable = Object.values(txByItem).reduce((s: number, v: any) => s + v, 0)

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0 flex flex-col"
          style={{ maxHeight: '92dvh' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-5 pb-3 border-b border-black/5">
            <div className="flex items-center justify-between">
              <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
              <SheetTitle className="text-[17px] font-semibold">📊 변동비 상세</SheetTitle>
              <button
                onClick={() => setShowManage(true)}
                className="text-[#007AFF] text-[16px] font-semibold"
              >
                수정
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

            {/* 이번 달 합계 */}
            <div className="bg-[#FF6B35]/10 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-[13px] font-semibold text-[#FF6B35]">
                📊 {format(currentMonth, 'M월')} 변동비 합계
              </span>
              <span className="text-[18px] font-bold text-[#FF6B35]">
                {totalVariable.toLocaleString()}원
              </span>
            </div>

            {/* 원장 발행 내역 리스트 */}
            {monthlyTx.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[28px] mb-2">📋</p>
                <p className="text-[14px] font-semibold text-[#1C1C1E]">이번달 판관비 내역이 없어요</p>
                <p className="text-[12px] text-[#8E8E93] mt-1">원장에서 판관비로 등록하면 여기에 표시됩니다</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl overflow-hidden border border-black/5">
                {monthlyTx.map((t: any, idx: number) => (
                  <div key={t.id} className={cn(idx < monthlyTx.length - 1 && 'border-b border-black/5')}>
                    {editTxId === t.id ? (
                      /* 인라인 수정 폼 */
                      <div className="p-3 space-y-2 bg-[#FFF8F3]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] bg-[#FF9500]/10 text-[#FF9500] px-2 py-0.5 rounded-full font-semibold">{t.sub_category || '판관비'}</span>
                        </div>
                        <div className="relative">
                          <input type="text" inputMode="numeric" value={editAmount}
                            onChange={(e) => setEditAmount(fmt(e.target.value))} autoFocus
                            className="w-full px-3 py-2.5 bg-white rounded-xl text-[16px] font-bold text-[#FF6B35] outline-none pr-8 border border-[#FF6B35]/20"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8E8E93]">원</span>
                        </div>
                        <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                          className="w-full px-3 py-2 bg-white rounded-xl text-[13px] outline-none border border-black/8"
                        />
                        <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white rounded-xl text-[13px] outline-none border border-black/8"
                        />
                        <div className="flex gap-1.5">
                          {[{ v: 'transfer', l: '계좌이체' }, { v: 'cash', l: '현금' }, { v: 'card', l: '카드' }].map((pm) => (
                            <button key={pm.v} onClick={() => setEditPayment(pm.v)}
                              className={cn('flex-1 py-1.5 rounded-xl text-[12px] font-medium border-2 transition-all',
                                editPayment === pm.v ? 'border-[#FF6B35] bg-[#FF6B35]/10 text-[#FF6B35]' : 'border-transparent bg-white text-[#8E8E93]'
                              )}>{pm.l}</button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditTxId(null)} className="flex-1 py-2 bg-white rounded-xl text-[13px] text-[#8E8E93] border border-black/8">취소</button>
                          <button onClick={() => updateMutation.mutate(t.id)} disabled={updateMutation.isPending}
                            className="flex-1 py-2 bg-[#FF6B35] text-white rounded-xl text-[13px] font-bold disabled:opacity-50">저장</button>
                        </div>
                      </div>
                    ) : (
                      /* 내역 행 */
                      <div className="flex items-center px-4 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11px] bg-[#FF9500]/10 text-[#FF9500] px-1.5 py-0.5 rounded-full font-semibold">{t.sub_category || '판관비'}</span>
                          </div>
                          <p className="text-[14px] font-medium text-[#1C1C1E] truncate">{t.description}</p>
                          <p className="text-[11px] text-[#8E8E93] mt-0.5">
                            {format(new Date(t.transaction_date), 'M/d (E)', { locale: ko })}
                            {t.payment_method === 'cash' && ' · 현금'}
                            {t.payment_method === 'transfer' && ' · 계좌이체'}
                            {t.payment_method === 'card' && ' · 카드'}
                          </p>
                        </div>
                        <p className="text-[15px] font-bold text-[#FF3B30] mr-2">-{Number(t.amount).toLocaleString()}원</p>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => openEdit(t)}
                            className="text-[12px] text-[#007AFF] bg-[#007AFF]/10 px-2.5 py-1.5 rounded-lg font-medium">수정</button>
                          <button onClick={() => { if (confirm('삭제하시겠습니까?')) voidMutation.mutate(t.id) }}
                            className="text-[12px] text-[#FF3B30] bg-[#FF3B30]/10 px-2.5 py-1.5 rounded-lg font-medium">삭제</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pb-8" />
          </div>
        </SheetContent>
      </Sheet>

      {/* 항목 관리 모달 */}
      <VariableManageSheet
        open={showManage}
        onClose={() => setShowManage(false)}
        profile={profile}
        items={variableItems}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────
// 메인: SgaTab
// ─────────────────────────────────────────────────────────
export function SgaTab({ profile, monthStart, monthEnd, currentMonth }: SgaTabProps) {
  const supabase = createClient()
  const currentMonthKey = format(currentMonth, 'yyyy-MM')

  const [showFixedDetail, setShowFixedDetail] = useState(false)
  const [showVariableDetail, setShowVariableDetail] = useState(false)
  const [variableExpanded, setVariableExpanded] = useState(false)
  const VAR_LIMIT = 5

  // base 고정비 항목
  const { data: fixedBaseItems = [] } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, 'fixed'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount, billing_day, is_active')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return data || []
    },
  })

  // 오버라이드 전체 조회
  const { data: overrides = [] } = useQuery({
    queryKey: ['recurring-overrides', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expense_overrides')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('effective_month', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  // 현재 달 기준 효과적인 항목 계산
  const fixedEffectiveItems = getEffectiveFixedItems(fixedBaseItems, overrides, currentMonthKey)

  // 변동비 요약 + 상세내역 (이번 달 실제 지출)
  const { data: variableSummary } = useQuery({
    queryKey: ['sga-summary', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, sub_category, amount, description, transaction_date')
        .eq('company_id', profile.company_id)
        .eq('category', 'SGA')
        .eq('is_voided', false)
        .eq('is_internal_transfer', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: true })
      if (error) throw error
      const all = data || []
      const fixedTx = all.filter((t: any) => t.description?.startsWith('[정기]'))
      const variableTx = all.filter((t: any) => !t.description?.startsWith('[정기]'))
      const fixedTotal = fixedTx.reduce((s: number, t: any) => s + Number(t.amount), 0)
      const variableTotal = variableTx.reduce((s: number, t: any) => s + Number(t.amount), 0)
      return { fixedTotal, variableTotal, fixedTxCount: fixedTx.length, variableTxCount: variableTx.length, variableTxList: variableTx }
    },
  })

  // totalFixed: 현재 달 기준 오버라이드 적용된 합계
  const totalFixed = fixedEffectiveItems.reduce((s: number, i: any) => s + Number(i.amount), 0)
  const variableTotal = variableSummary?.variableTotal ?? 0
  const sgaActualTotal = totalFixed + variableTotal

  // ── 출력 함수 ──
  const handlePrint = () => {
    const monthLabel = format(currentMonth, 'yyyy년 M월', { locale: ko })
    const companyName = profile.company?.name ?? ''

    const fixedRows = fixedEffectiveItems.map((item: any) => `
      <tr>
        <td>${item.billing_day}일</td>
        <td>${item.name}${item.memo ? `<span class="memo"> · ${item.memo}</span>` : ''}</td>
        <td class="amount">${Number(item.amount).toLocaleString()}원</td>
      </tr>`).join('')

    const variableTxList = variableSummary?.variableTxList ?? []
    const variableRows = variableTxList.length > 0
      ? variableTxList.map((t: any) => `
      <tr>
        <td>${t.transaction_date}</td>
        <td>${t.sub_category ? `<span class="badge">${t.sub_category}</span> ` : ''}${t.description || '-'}</td>
        <td class="amount">${Number(t.amount).toLocaleString()}원</td>
      </tr>`).join('')
      : '<tr><td colspan="3" class="empty">이번 달 변동경비 내역이 없습니다</td></tr>'

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${monthLabel} 판관비 보고서</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Apple SD Gothic Neo', -apple-system, 'Malgun Gothic', sans-serif;
         color: #1C1C1E; padding: 32px 40px; font-size: 13px; background: #fff; }
  .header { border-bottom: 2px solid #1C1C1E; padding-bottom: 16px; margin-bottom: 24px; }
  .company { font-size: 11px; color: #8E8E93; margin-bottom: 4px; }
  .title { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .subtitle { font-size: 13px; color: #8E8E93; margin-top: 4px; }
  .summary-box { display: flex; gap: 0; margin-bottom: 28px; border: 1px solid #E5E5EA; border-radius: 10px; overflow: hidden; }
  .summary-item { flex: 1; padding: 14px 18px; }
  .summary-item:not(:last-child) { border-right: 1px solid #E5E5EA; }
  .summary-label { font-size: 11px; color: #8E8E93; margin-bottom: 4px; }
  .summary-value { font-size: 18px; font-weight: 700; }
  .summary-value.total { color: #FF3B30; }
  .summary-value.fixed { color: #5856D6; }
  .summary-value.variable { color: #FF6B35; }
  .section { margin-bottom: 28px; }
  .section-header { display: flex; align-items: center; gap: 8px;
                    background: #F2F2F7; border-radius: 8px; padding: 10px 14px;
                    margin-bottom: 0; }
  .section-title { font-size: 14px; font-weight: 700; }
  .section-count { font-size: 11px; color: #8E8E93; margin-left: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #FAFAFA; text-align: left; padding: 9px 14px;
       font-size: 11px; color: #8E8E93; font-weight: 600;
       border-bottom: 1px solid #E5E5EA; }
  td { padding: 10px 14px; border-bottom: 1px solid #F2F2F7;
       font-size: 13px; vertical-align: middle; }
  td.amount { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  td.empty { text-align: center; color: #C7C7CC; padding: 20px; }
  .memo { color: #8E8E93; font-size: 11px; }
  .badge { background: #FF6B35; color: white; border-radius: 4px;
           padding: 1px 6px; font-size: 10px; font-weight: 600; }
  .total-row td { font-weight: 700; background: #F8F8FF; border-top: 2px solid #E5E5EA; }
  .total-row td.amount { color: #5856D6; font-size: 15px; }
  .total-row.var td { background: #FFF8F4; }
  .total-row.var td.amount { color: #FF6B35; }
  .grand-total { margin-top: 24px; border: 2px solid #FF3B30;
                 border-radius: 10px; padding: 16px 20px;
                 display: flex; align-items: center; justify-content: space-between; }
  .grand-label { font-size: 14px; font-weight: 700; }
  .grand-value { font-size: 22px; font-weight: 800; color: #FF3B30; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E5EA;
            font-size: 11px; color: #C7C7CC; display: flex; justify-content: space-between; }
  .close-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .close-btn { background: #F2F2F7; border: none; border-radius: 10px;
               padding: 8px 18px; font-size: 14px; font-weight: 600;
               color: #3C3C43; cursor: pointer; }
  .close-btn:hover { background: #E5E5EA; }
  @media print {
    .close-bar { display: none; }
    body { padding: 20px 28px; }
    @page { margin: 15mm 12mm; size: A4; }
  }
</style>
</head>
<body>
<div class="close-bar">
  <button class="close-btn" onclick="window.close()">✕ 닫기</button>
</div>
<div class="header">
  ${companyName ? `<p class="company">${companyName}</p>` : ''}
  <p class="title">📊 ${monthLabel} 판관비 보고서</p>
  <p class="subtitle">고정판관비 + 변동경비 현황</p>
</div>

<div class="summary-box">
  <div class="summary-item">
    <div class="summary-label">📌 고정판관비</div>
    <div class="summary-value fixed">${totalFixed.toLocaleString()}원</div>
  </div>
  <div class="summary-item">
    <div class="summary-label">📊 변동경비</div>
    <div class="summary-value variable">${variableTotal.toLocaleString()}원</div>
  </div>
  <div class="summary-item">
    <div class="summary-label">합계</div>
    <div class="summary-value total">${sgaActualTotal.toLocaleString()}원</div>
  </div>
</div>

<div class="section">
  <div class="section-header">
    <span class="section-title">📌 고정판관비</span>
    <span class="section-count">${fixedEffectiveItems.length}개 항목</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:60px">납기일</th>
        <th>항목명</th>
        <th style="width:140px;text-align:right">월 금액</th>
      </tr>
    </thead>
    <tbody>
      ${fixedRows || '<tr><td colspan="3" class="empty">고정비 항목이 없습니다</td></tr>'}
      <tr class="total-row">
        <td colspan="2">합계</td>
        <td class="amount">${totalFixed.toLocaleString()}원</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-header">
    <span class="section-title">📊 변동경비</span>
    <span class="section-count">${monthLabel} 실적</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:130px">날짜</th>
        <th>내용</th>
        <th style="width:140px;text-align:right">금액</th>
      </tr>
    </thead>
    <tbody>
      ${variableRows}
      ${variableTxList.length > 0 ? `
      <tr class="total-row var">
        <td colspan="2">합계</td>
        <td class="amount">${variableTotal.toLocaleString()}원</td>
      </tr>` : ''}
    </tbody>
  </table>
</div>

<div class="grand-total">
  <span class="grand-label">🧾 ${monthLabel} 판관비 총계</span>
  <span class="grand-value">-${sgaActualTotal.toLocaleString()}원</span>
</div>

<div class="footer">
  <span>출력일: ${format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
  <span>Chapter Works</span>
</div>

<script>window.onload = () => { window.focus(); window.print(); }</script>
</body>
</html>`

    const pw = window.open('', '_blank', 'width=800,height=700')
    if (pw) {
      pw.document.write(html)
      pw.document.close()
    }
  }

  // ── 모바일용 고정비 카드 (클릭 → Sheet)
  const FixedCardMobile = (
    <button
      onClick={() => setShowFixedDetail(true)}
      className="w-full text-left bg-white rounded-2xl border border-black/5 overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[16px] font-bold text-[#1C1C1E]">📌 고정판관비</span>
              <span className="text-[11px] bg-[#5856D6]/10 text-[#5856D6] px-2 py-0.5 rounded-full font-medium">
                {fixedEffectiveItems.length}개 항목
              </span>
            </div>
            <p className="text-[24px] font-bold text-[#5856D6]">{totalFixed.toLocaleString()}원</p>
            <p className="text-[12px] text-[#8E8E93] mt-1">
              매월 자동 합산 · {fixedEffectiveItems.length}개 항목
            </p>
          </div>
          <div className="text-right">
            <span className="text-[12px] text-[#8E8E93] font-medium bg-[#F2F2F7] px-2.5 py-1 rounded-xl">
              상세보기 →
            </span>
          </div>
        </div>
      </div>
      {fixedEffectiveItems.length > 0 && (
        <div className="border-t border-black/5">
          {fixedEffectiveItems.slice(0, 5).map((item: any, idx: number) => (
            <div key={item.id} className={cn(
              'flex justify-between items-center px-4 py-2.5',
              idx < Math.min(fixedEffectiveItems.length, 5) - 1 && 'border-b border-black/5'
            )}>
              <span className="text-[13px] text-[#3C3C43]">
                <span className="text-[#8E8E93] mr-1.5">{item.billing_day}일</span>
                {item.name}
                {item.is_override && (
                  <span className="ml-1.5 text-[10px] bg-[#FF9500]/15 text-[#FF9500] px-1.5 py-0.5 rounded-full">변경됨</span>
                )}
              </span>
              <span className="text-[13px] font-semibold text-[#5856D6]">
                {Number(item.amount).toLocaleString()}원
              </span>
            </div>
          ))}
          {fixedEffectiveItems.length > 5 && (
            <div className="px-4 py-2 text-center">
              <span className="text-[12px] text-[#007AFF]">+{fixedEffectiveItems.length - 5}개 더보기 →</span>
            </div>
          )}
        </div>
      )}
    </button>
  )

  // ── 모바일용 변동비 카드 (인라인 내역 + 더보기)
  const varTxList = variableSummary?.variableTxList ?? []
  const varDisplayed = variableExpanded ? varTxList : varTxList.slice(0, VAR_LIMIT)
  const varHasMore = varTxList.length > VAR_LIMIT

  const VariableCardMobile = (
    <div className="w-full text-left bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* 헤더 — 탭하면 Sheet 열림 */}
      <button
        onClick={() => setShowVariableDetail(true)}
        className="w-full text-left px-4 pt-4 pb-3 active:bg-black/3"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[16px] font-bold text-[#1C1C1E]">📊 변동 경비</span>
              <span className="text-[11px] bg-[#FF6B35]/10 text-[#FF6B35] px-2 py-0.5 rounded-full font-medium">
                {format(currentMonth, 'M월')} 실적
              </span>
            </div>
            <p className="text-[24px] font-bold text-[#FF6B35]">{variableTotal.toLocaleString()}원</p>
            <p className="text-[12px] text-[#8E8E93] mt-1">
              이번달 {variableSummary?.variableTxCount ?? 0}건 · 탭해서 상세보기
            </p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
            <span className="text-[16px] text-[#FF6B35]">›</span>
          </div>
        </div>
      </button>
      {/* 거래내역 인라인 리스트 */}
      {varDisplayed.length > 0 && (
        <div className="border-t border-black/5">
          {varDisplayed.map((tx: any, idx: number) => (
            <div
              key={tx.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                idx < varDisplayed.length - 1 && 'border-b border-black/5'
              )}
            >
              <span className="text-[11px] text-[#8E8E93] w-10 flex-shrink-0">
                {tx.transaction_date ? tx.transaction_date.slice(5).replace('-', '/') : '-'}
              </span>
              <span className="text-[12px] text-[#3C3C43] flex-1 truncate">
                {tx.description || '-'}
              </span>
              <span className="text-[12px] font-semibold text-[#FF6B35] flex-shrink-0">
                {Number(tx.amount).toLocaleString()}원
              </span>
            </div>
          ))}
          {varTxList.length === 0 && (
            <div className="px-4 py-3 text-center">
              <p className="text-[12px] text-[#C7C7CC]">이번달 변동경비 없음</p>
            </div>
          )}
          {varHasMore && (
            <button
              onClick={() => setVariableExpanded(!variableExpanded)}
              className="w-full flex items-center justify-center gap-1 py-2.5 text-[12px] text-[#007AFF] font-semibold border-t border-black/5 active:opacity-70"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', variableExpanded && 'rotate-180')} />
              {variableExpanded ? '접기' : `+${varTxList.length - VAR_LIMIT}건 더보기`}
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4 space-y-3">

      {/* 월 합계 헤더 */}
      <div className="rounded-2xl px-5 py-5" style={{ background: '#FF3B30', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-white/80 mb-1">
              {format(currentMonth, 'M월', { locale: ko })} 판관비 총계 <span className="text-[11px] text-white/60">(고정비+변동비)</span>
            </p>
            <p className="text-[32px] font-bold text-white">
              -{sgaActualTotal.toLocaleString()}
              <span className="text-[16px] font-normal ml-1">원</span>
            </p>
            <div className="flex gap-3 mt-2">
              <span className="text-[12px] text-white/80">고정비 {totalFixed.toLocaleString()}원</span>
              <span className="text-[12px] text-white/50">·</span>
              <span className="text-[12px] text-white/80">변동비 {variableTotal.toLocaleString()}원</span>
            </div>
          </div>
          {/* 출력 버튼 */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors rounded-xl px-3 py-2 text-white text-[13px] font-semibold flex-shrink-0"
            title="판관비 보고서 출력"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M3.5 5V2.5H11.5V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="1" y="5" width="13" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M3.5 8.5H11.5V13H3.5V8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <circle cx="11.5" cy="7.5" r="0.8" fill="currentColor"/>
            </svg>
            출력
          </button>
        </div>
      </div>

      {/* 모바일: 요약 카드 (클릭 → Sheet) */}
      <div className="md:hidden space-y-3">
        {FixedCardMobile}
        {VariableCardMobile}
      </div>

      {/* PC: 인라인 전체 표시 (시트 없이) */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 items-start">
        {/* PC 고정판관비 인라인 패널 */}
        <PCFixedInlinePanel
          profile={profile}
          monthStart={monthStart}
          monthEnd={monthEnd}
          currentMonth={currentMonth}
          fixedBaseItems={fixedBaseItems}
          fixedEffectiveItems={fixedEffectiveItems}
          overrides={overrides}
          currentMonthKey={currentMonthKey}
          totalFixed={totalFixed}
        />
        {/* PC 변동경비 인라인 패널 */}
        <PCVariableInlinePanel
          profile={profile}
          monthStart={monthStart}
          monthEnd={monthEnd}
          currentMonth={currentMonth}
        />
      </div>

      {/* 상세 Sheets (모바일 전용) */}
      <FixedDetailSheet
        open={showFixedDetail}
        onClose={() => setShowFixedDetail(false)}
        profile={profile}
        monthStart={monthStart}
        monthEnd={monthEnd}
        currentMonth={currentMonth}
      />
      <VariableDetailSheet
        open={showVariableDetail}
        onClose={() => setShowVariableDetail(false)}
        profile={profile}
        monthStart={monthStart}
        monthEnd={monthEnd}
        currentMonth={currentMonth}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PC 전용: 고정판관비 인라인 패널
// ─────────────────────────────────────────────────────────
function PCFixedInlinePanel({
  profile,
  monthStart,
  monthEnd,
  currentMonth,
  fixedBaseItems,
  fixedEffectiveItems,
  overrides,
  currentMonthKey,
  totalFixed,
}: {
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
  fixedBaseItems: any[]
  fixedEffectiveItems: any[]
  overrides: any[]
  currentMonthKey: string
  totalFixed: number
}) {
  const [showManage, setShowManage] = useState(false)

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-black/10 bg-[#E5E5EA]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[15px] font-bold text-[#1C1C1E]">📌 고정판관비</span>
              <span className="text-[11px] bg-[#5856D6]/10 text-[#5856D6] px-2 py-0.5 rounded-full font-medium">
                {fixedEffectiveItems.length}개 항목
              </span>
            </div>
            <p className="text-[22px] font-bold text-[#5856D6]">{totalFixed.toLocaleString()}원</p>
            <p className="text-[12px] text-[#8E8E93] mt-0.5">
              {format(currentMonth, 'M월', { locale: ko })} 합계
            </p>
          </div>
          <button
            onClick={() => setShowManage(true)}
            className="text-[13px] font-semibold text-[#5856D6] bg-[#5856D6]/10 px-3 py-1.5 rounded-xl hover:bg-[#5856D6]/20 transition-colors"
          >
            항목 수정
          </button>
        </div>
      </div>

      {/* 전체 항목 목록 */}
      <div className="divide-y divide-black/5">
        {fixedEffectiveItems.length === 0 ? (
          <div className="text-center py-10 text-[#8E8E93] text-[14px]">
            <p className="text-[28px] mb-2">📌</p>
            <p>고정비 항목이 없어요</p>
            <p className="text-[12px] mt-1">항목 수정 버튼으로 추가하세요</p>
          </div>
        ) : (
          fixedEffectiveItems.map((item: any) => (
            <div key={item.id} className="flex items-center px-4 py-3.5 gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#5856D6]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-[#5856D6]">{item.billing_day}일</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-semibold text-[#1C1C1E] truncate">{item.name}</p>
                  {item.is_override && (
                    <span className="text-[10px] bg-[#FF9500]/15 text-[#FF9500] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">변경됨</span>
                  )}
                </div>
                {item.memo && (
                  <p className="text-[11px] text-[#8E8E93] truncate mt-0.5">{item.memo}</p>
                )}
              </div>
              <p className={cn(
                'text-[14px] font-bold flex-shrink-0',
                Number(item.amount) > 0 ? 'text-[#5856D6]' : 'text-[#C7C7CC]'
              )}>
                {Number(item.amount) > 0 ? `${Number(item.amount).toLocaleString()}원` : '미입력'}
              </p>
            </div>
          ))
        )}
      </div>

      {/* 항목 수정 모달 */}
      <FixedManageSheet
        open={showManage}
        onClose={() => setShowManage(false)}
        profile={profile}
        monthStart={monthStart}
        baseItems={fixedBaseItems}
        effectiveItems={fixedEffectiveItems}
        overrides={overrides}
        currentMonthKey={currentMonthKey}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PC 전용: 변동경비 인라인 패널
// ─────────────────────────────────────────────────────────
function PCVariableInlinePanel({
  profile,
  monthStart,
  monthEnd,
  currentMonth,
}: {
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [showManage, setShowManage] = useState(false)
  const [editTxId, setEditTxId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editPayment, setEditPayment] = useState('transfer')

  const { data: variableItems = [] } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, 'variable'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'variable')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  const { data: monthlyTx = [] } = useQuery({
    queryKey: ['variable-tx', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, sub_category, amount, supply_amount, description, transaction_date, payment_method')
        .eq('company_id', profile.company_id)
        .eq('category', 'SGA')
        .eq('is_voided', false)
        .eq('is_internal_transfer', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return (data || []).filter((t: any) => !t.description?.startsWith('[정기]'))
    },
  })

  const txByItem = monthlyTx.reduce((acc: Record<string, number>, t: any) => {
    const key = t.sub_category || '기타'
    acc[key] = (acc[key] || 0) + Number(t.amount)
    return acc
  }, {})

  const totalVariable = Object.values(txByItem).reduce((s: number, v: any) => s + v, 0)

  const fmt = (v: string) => {
    const n = v.replace(/\D/g, '')
    return n ? parseInt(n).toLocaleString() : ''
  }

  const invalidateTx = () => {
    queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
    queryClient.invalidateQueries({ queryKey: ['variable-tx', profile.company_id, monthStart, monthEnd] })
    queryClient.invalidateQueries({ queryKey: ['sga-summary', profile.company_id, monthStart] })
  }

  const updateMutation = useMutation({
    mutationFn: async (txId: string) => {
      const numAmount = parseInt(editAmount.replace(/,/g, ''))
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!editDesc.trim()) throw new Error('적요를 입력해주세요')
      const { error } = await supabase.from('transactions').update({
        amount: numAmount, supply_amount: numAmount,
        description: editDesc.trim(), transaction_date: editDate, payment_method: editPayment,
      }).eq('id', txId)
      if (error) throw error
    },
    onSuccess: () => { invalidateTx(); toast.success('수정되었습니다'); setEditTxId(null) },
    onError: (e: any) => toast.error(e.message),
  })

  const voidMutation = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from('transactions').update({ is_voided: true }).eq('id', txId)
      if (error) throw error
    },
    onSuccess: () => { invalidateTx(); toast.success('삭제되었습니다') },
    onError: (e: any) => toast.error(e.message),
  })

  const openEdit = (t: any) => {
    setEditTxId(t.id)
    setEditAmount(Number(t.amount).toLocaleString())
    setEditDesc(t.description || '')
    setEditDate(t.transaction_date)
    setEditPayment(t.payment_method || 'transfer')
  }



  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-black/10 bg-[#E5E5EA]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[15px] font-bold text-[#1C1C1E]">📊 변동 경비</span>
              <span className="text-[11px] bg-[#FF6B35]/10 text-[#FF6B35] px-2 py-0.5 rounded-full font-medium">
                {format(currentMonth, 'M월', { locale: ko })} 실적
              </span>
            </div>
            <p className="text-[22px] font-bold text-[#FF6B35]">{totalVariable.toLocaleString()}원</p>
            <p className="text-[12px] text-[#8E8E93] mt-0.5">이번달 발생 변동 경비</p>
          </div>
          <button
            onClick={() => setShowManage(true)}
            className="text-[13px] font-semibold text-[#FF6B35] bg-[#FF6B35]/10 px-3 py-1.5 rounded-xl hover:bg-[#FF6B35]/20 transition-colors"
          >
            항목 수정
          </button>
        </div>
      </div>

      {/* 원장 발행 내역 리스트 */}
      {monthlyTx.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-[28px] mb-2">📋</p>
          <p className="text-[14px] font-semibold text-[#1C1C1E]">이번달 판관비 내역이 없어요</p>
          <p className="text-[12px] text-[#8E8E93] mt-1">원장에서 판관비로 등록하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="divide-y divide-black/5">
          {monthlyTx.map((t: any) => (
            <div key={t.id}>
              {editTxId === t.id ? (
                /* 인라인 수정 폼 */
                <div className="mx-4 my-2 bg-[#FFF8F3] rounded-xl p-3 space-y-2.5 border border-[#FF6B35]/15">
                  <p className="text-[12px] font-semibold text-[#FF6B35]">
                    {t.sub_category || '판관비'} 수정
                  </p>
                  <div className="relative">
                    <input
                      type="text" inputMode="numeric"
                      value={editAmount}
                      onChange={(e) => setEditAmount(fmt(e.target.value))}
                      placeholder="금액"
                      autoFocus
                      className="w-full px-3 py-3 bg-white rounded-xl text-[18px] font-bold text-[#FF6B35] outline-none pr-8 border border-[#FF6B35]/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
                  </div>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="적요"
                    className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none border border-black/8"
                  />
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] outline-none border border-black/8"
                  />
                  <div className="flex gap-1.5">
                    {[{ v: 'transfer', l: '계좌이체' }, { v: 'cash', l: '현금' }, { v: 'card', l: '카드' }].map((pm) => (
                      <button
                        key={pm.v}
                        onClick={() => setEditPayment(pm.v)}
                        className={cn(
                          'flex-1 py-1.5 rounded-xl text-[12px] font-medium border-2 transition-all',
                          editPayment === pm.v
                            ? 'border-[#FF6B35] bg-[#FF6B35]/10 text-[#FF6B35]'
                            : 'border-transparent bg-white text-[#8E8E93]'
                        )}
                      >{pm.l}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditTxId(null)}
                      className="flex-1 py-2 bg-white rounded-xl text-[13px] text-[#8E8E93] border border-black/8"
                    >취소</button>
                    <button
                      onClick={() => updateMutation.mutate(t.id)}
                      disabled={updateMutation.isPending}
                      className="flex-1 py-2 bg-[#FF6B35] text-white rounded-xl text-[13px] font-bold disabled:opacity-50"
                    >저장</button>
                  </div>
                </div>
              ) : (
                /* 내역 행 */
                <div className="flex items-center px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {t.sub_category && (
                        <span className="text-[11px] bg-[#FF6B35]/10 text-[#FF6B35] px-1.5 py-0.5 rounded-md font-medium">
                          {t.sub_category}
                        </span>
                      )}
                      <p className="text-[13px] text-[#3C3C43] truncate">{t.description || '-'}</p>
                    </div>
                    <p className="text-[11px] text-[#8E8E93]">{t.transaction_date}</p>
                  </div>
                  <p className="text-[14px] font-bold text-[#FF3B30] flex-shrink-0">
                    -{Number(t.amount).toLocaleString()}원
                  </p>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(t)}
                      className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center hover:bg-[#E5E5EA] transition-colors"
                      title="수정"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="#3C3C43" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('이 내역을 삭제할까요?')) voidMutation.mutate(t.id)
                      }}
                      className="w-7 h-7 rounded-lg bg-[#FF3B30]/10 flex items-center justify-center hover:bg-[#FF3B30]/20 transition-colors"
                      title="삭제"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 3H10M4 3V2H8V3M5 5.5V9M7 5.5V9M3 3L3.5 10H8.5L9 3H3Z" stroke="#FF3B30" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 항목 수정 모달 */}
      <VariableManageSheet
        open={showManage}
        onClose={() => setShowManage(false)}
        profile={profile}
        items={variableItems}
      />
    </div>
  )
}
