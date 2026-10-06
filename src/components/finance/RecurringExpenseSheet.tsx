'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { VARIABLE_EXPENSE_ITEMS } from '@/types'
import type { RecurringExpense, RecurringExpenseType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  profile: any
}

type FormMode = 'list' | 'add' | 'edit'

const BILLING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

// 고정비 기본 항목 제안
const FIXED_SUGGESTIONS = ['임차료', '직원 급여', '4대보험', '차량 할부', '통신비', '소프트웨어 구독료', '임원 급여']

export function RecurringExpenseSheet({ open, onClose, profile }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 탭: fixed | variable
  const [activeTab, setActiveTab] = useState<RecurringExpenseType>('fixed')
  const [formMode, setFormMode] = useState<FormMode>('list')
  const [editTarget, setEditTarget] = useState<RecurringExpense | null>(null)

  // 폼 상태
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [billingDay, setBillingDay] = useState<number>(25)
  const [memo, setMemo] = useState('')

  // ── 목록 조회 ──────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, activeTab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('expense_type', activeTab)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as RecurringExpense[]
    },
    enabled: open,
  })

  const activeItems = items.filter((i) => i.is_active)
  const inactiveItems = items.filter((i) => !i.is_active)

  // ── 등록 ──────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async () => {
      const numAmount = activeTab === 'fixed' ? parseInt(amount.replace(/,/g, '') || '0') : 0
      if (!name.trim()) throw new Error('항목명을 입력해주세요')
      if (activeTab === 'fixed') {
        if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      }

      const { error } = await supabase.from('recurring_expenses').insert({
        company_id: profile.company_id,
        name: name.trim(),
        expense_type: activeTab,
        sub_category: 'SGA',
        amount: numAmount,
        billing_day: activeTab === 'fixed' ? billingDay : null,
        memo: memo.trim() || null,
        is_active: true,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
      toast.success('항목이 등록되었습니다')
      resetForm()
    },
    onError: (e: any) => toast.error(e.message || '등록에 실패했습니다'),
  })

  // ── 수정 ──────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return
      const numAmount = activeTab === 'fixed' ? parseInt(amount.replace(/,/g, '') || '0') : 0
      if (!name.trim()) throw new Error('항목명을 입력해주세요')
      if (activeTab === 'fixed' && (!numAmount || numAmount <= 0)) throw new Error('금액을 입력해주세요')

      const { error } = await supabase.from('recurring_expenses').update({
        name: name.trim(),
        amount: numAmount,
        billing_day: activeTab === 'fixed' ? billingDay : null,
        memo: memo.trim() || null,
      }).eq('id', editTarget.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
      toast.success('수정되었습니다')
      resetForm()
    },
    onError: (e: any) => toast.error(e.message || '수정에 실패했습니다'),
  })

  // ── 활성/비활성 토글 ───────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('recurring_expenses').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
      toast.success(vars.is_active ? '활성화되었습니다' : '비활성화되었습니다')
    },
    onError: (e: any) => toast.error(e.message),
  })

  // ── 삭제 ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id] })
      toast.success('삭제되었습니다')
    },
    onError: (e: any) => toast.error(e.message),
  })

  // ── 폼 초기화 ─────────────────────────────────────────
  const resetForm = () => {
    setFormMode('list')
    setEditTarget(null)
    setName('')
    setAmount('')
    setBillingDay(25)
    setMemo('')
  }

  const openEdit = (item: RecurringExpense) => {
    setEditTarget(item)
    setName(item.name)
    setAmount(item.amount > 0 ? item.amount.toLocaleString() : '')
    setBillingDay(item.billing_day ?? 25)
    setMemo(item.memo ?? '')
    setFormMode('edit')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const formatAmount = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  const totalFixed = activeItems
    .filter((i) => i.expense_type === 'fixed')
    .reduce((s, i) => s + Number(i.amount), 0)

  // ── 렌더링 ────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            {formMode === 'list' ? (
              <button onClick={handleClose} className="text-[#007AFF] text-[16px]">닫기</button>
            ) : (
              <button onClick={resetForm} className="text-[#007AFF] text-[16px]">← 목록</button>
            )}
            <SheetTitle className="text-[17px] font-semibold">
              {formMode === 'add' ? '항목 추가' : formMode === 'edit' ? '항목 수정' : '정기지출 관리'}
            </SheetTitle>
            {formMode === 'list' ? (
              <button
                onClick={() => setFormMode('add')}
                className="text-[#007AFF] text-[16px] font-semibold"
              >
                + 추가
              </button>
            ) : (
              <button
                onClick={() => formMode === 'add' ? addMutation.mutate() : editMutation.mutate()}
                disabled={addMutation.isPending || editMutation.isPending}
                className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
              >
                저장
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── 탭 (고정비/변동비) ── */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex rounded-xl overflow-hidden border border-black/10">
              <button
                onClick={() => { setActiveTab('fixed'); resetForm() }}
                className={cn(
                  'flex-1 py-2.5 text-[14px] font-bold transition-all',
                  activeTab === 'fixed' ? 'bg-[#5856D6] text-white' : 'bg-white text-[#8E8E93]'
                )}
              >
                📌 고정비
              </button>
              <button
                onClick={() => { setActiveTab('variable'); resetForm() }}
                className={cn(
                  'flex-1 py-2.5 text-[14px] font-bold transition-all border-l border-black/10',
                  activeTab === 'variable' ? 'bg-[#FF6B35] text-white' : 'bg-white text-[#8E8E93]'
                )}
              >
                📊 변동비
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              LIST MODE
          ══════════════════════════════════════════════ */}
          {formMode === 'list' && (
            <div className="px-5 py-3 space-y-4">

              {/* 고정비 월 합계 */}
              {activeTab === 'fixed' && activeItems.length > 0 && (
                <div className="bg-[#5856D6]/10 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-[13px] font-semibold text-[#5856D6]">📌 월 고정비 합계</span>
                  <span className="text-[18px] font-bold text-[#5856D6]">
                    {totalFixed.toLocaleString()}원
                  </span>
                </div>
              )}

              {/* 변동비 안내 */}
              {activeTab === 'variable' && (
                <div className="bg-[#FF6B35]/10 rounded-xl px-4 py-3">
                  <p className="text-[13px] text-[#FF6B35] font-semibold">📊 변동비 항목</p>
                  <p className="text-[12px] text-[#FF6B35] mt-0.5">
                    발생 시 '지출 기입' 버튼을 눌러 실제 금액을 등록하세요
                  </p>
                </div>
              )}

              {/* 활성 항목 목록 */}
              {isLoading ? (
                <div className="text-center py-8 text-[#8E8E93] text-[14px]">불러오는 중...</div>
              ) : activeItems.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[32px] mb-2">{activeTab === 'fixed' ? '📌' : '📊'}</p>
                  <p className="text-[15px] font-semibold text-[#1C1C1E]">등록된 항목이 없어요</p>
                  <p className="text-[13px] text-[#8E8E93] mt-1">
                    {activeTab === 'fixed'
                      ? '매달 고정으로 지출되는 항목을 추가하세요'
                      : '발생 시 기입할 변동비 항목을 추가하세요'}
                  </p>
                  <button
                    onClick={() => setFormMode('add')}
                    className="mt-4 px-6 py-2.5 bg-[#007AFF] text-white rounded-xl text-[14px] font-semibold"
                  >
                    + 항목 추가
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-black/8 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold text-[#1C1C1E]">{item.name}</span>
                            {activeTab === 'fixed' && item.billing_day && (
                              <span className="text-[11px] bg-[#5856D6]/10 text-[#5856D6] px-2 py-0.5 rounded-full font-medium">
                                매월 {item.billing_day}일
                              </span>
                            )}
                          </div>
                          {activeTab === 'fixed' && (
                            <p className="text-[16px] font-bold text-[#5856D6] mt-1">
                              {Number(item.amount).toLocaleString()}원
                            </p>
                          )}
                          {item.memo && (
                            <p className="text-[12px] text-[#8E8E93] mt-0.5">{item.memo}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={() => openEdit(item)}
                            className="text-[13px] text-[#007AFF] px-2 py-1 rounded-lg bg-[#007AFF]/10"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`'${item.name}'을 비활성화할까요?`)) {
                                toggleMutation.mutate({ id: item.id, is_active: false })
                              }
                            }}
                            className="text-[13px] text-[#8E8E93] px-2 py-1 rounded-lg bg-[#F2F2F7]"
                          >
                            중단
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 비활성 항목 */}
              {inactiveItems.length > 0 && (
                <div>
                  <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-2">
                    중단된 항목
                  </p>
                  <div className="space-y-2">
                    {inactiveItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-[#F2F2F7] rounded-xl px-4 py-3 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-[14px] text-[#8E8E93] line-through">{item.name}</span>
                          {activeTab === 'fixed' && (
                            <span className="text-[13px] text-[#C7C7CC] ml-2">
                              {Number(item.amount).toLocaleString()}원
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleMutation.mutate({ id: item.id, is_active: true })}
                            className="text-[12px] text-[#34C759] px-2 py-1 rounded-lg bg-[#34C759]/10"
                          >
                            재활성
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`'${item.name}'을 완전히 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) {
                                deleteMutation.mutate(item.id)
                              }
                            }}
                            className="text-[12px] text-[#FF3B30] px-2 py-1 rounded-lg bg-[#FF3B30]/10"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pb-8" />
            </div>
          )}

          {/* ══════════════════════════════════════════════
              ADD / EDIT FORM
          ══════════════════════════════════════════════ */}
          {(formMode === 'add' || formMode === 'edit') && (
            <div className="px-5 py-4 space-y-4">

              {/* 항목명 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                  항목명 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={activeTab === 'fixed' ? '예: 사무실 임차료, 직원 급여' : '예: 유류비, 회식비'}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
                />

                {/* 빠른 선택 제안 */}
                {formMode === 'add' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(activeTab === 'fixed' ? FIXED_SUGGESTIONS : [...VARIABLE_EXPENSE_ITEMS]).map((sug) => (
                      <button
                        key={sug}
                        onClick={() => setName(sug)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all',
                          name === sug
                            ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                            : 'border-black/10 bg-white text-[#8E8E93]'
                        )}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 금액 (고정비만) */}
              {activeTab === 'fixed' && (
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                    월 금액 *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(formatAmount(e.target.value))}
                      placeholder="0"
                      className="w-full px-4 py-4 rounded-xl text-[24px] font-bold placeholder:text-[#C7C7CC] outline-none pr-10 bg-[#5856D6]/10 text-[#5856D6]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
                  </div>
                </div>
              )}

              {/* 결제일 (고정비만) */}
              {activeTab === 'fixed' && (
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                    매월 결제일 *
                  </label>
                  <div className="relative">
                    <select
                      value={billingDay}
                      onChange={(e) => setBillingDay(parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none font-medium"
                    >
                      {BILLING_DAYS.map((d) => (
                        <option key={d} value={d}>매월 {d}일</option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none">▼</span>
                  </div>
                  <p className="text-[12px] text-[#8E8E93] mt-1.5 pl-1">
                    💡 매월 이 날짜에 자동으로 거래가 생성됩니다
                  </p>
                </div>
              )}

              {/* 변동비 안내 */}
              {activeTab === 'variable' && (
                <div className="bg-[#FF6B35]/10 rounded-xl px-4 py-3">
                  <p className="text-[13px] text-[#FF6B35] font-semibold">📊 변동비 항목</p>
                  <p className="text-[12px] text-[#FF6B35] mt-0.5">
                    금액은 발생 시점에 직접 입력합니다.<br />
                    항목명만 미리 등록해 두면, 회사손익 탭에서 빠르게 기입할 수 있습니다.
                  </p>
                </div>
              )}

              {/* 메모 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                  메모 (선택)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: OO은행 자동이체, 담당자 연락처 등"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
                />
              </div>

              <div className="pb-8" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
