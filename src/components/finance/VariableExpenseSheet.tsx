'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { RecurringExpense } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  profile: any
  /** 미리 선택된 변동비 항목 (nullable) */
  preselectedItem?: RecurringExpense | null
}

export function VariableExpenseSheet({ open, onClose, profile, preselectedItem }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [selectedItem, setSelectedItem] = useState<RecurringExpense | null>(preselectedItem ?? null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [projectId, setProjectId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')

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
      return (data || []) as RecurringExpense[]
    },
    enabled: open,
  })

  // 현장 목록
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .eq('status', 'active')
        .order('name')
      return data || []
    },
    enabled: open,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const numAmount = parseInt(amount.replace(/,/g, ''))
      if (!selectedItem) throw new Error('항목을 선택해주세요')
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!description.trim()) throw new Error('적요를 입력해주세요')

      const { error } = await supabase.from('transactions').insert({
        company_id: profile.company_id,
        type: 'expense',
        category: 'SGA',
        sub_category: selectedItem.name,
        amount: numAmount,
        description: description.trim(),
        transaction_date: txDate,
        project_id: (projectId && projectId !== '__none__') ? projectId : null,
        payment_method: paymentMethod,
        is_site_expense: false,
        is_internal_transfer: false,
        is_voided: false,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['project-pl'], exact: false })
      toast.success(`${selectedItem?.name} 지출이 등록되었습니다`)
      handleClose()
    },
    onError: (e: any) => toast.error(e.message || '등록에 실패했습니다'),
  })

  const handleClose = () => {
    setSelectedItem(preselectedItem ?? null)
    setAmount('')
    setDescription('')
    setTxDate(format(new Date(), 'yyyy-MM-dd'))
    setProjectId('')
    setPaymentMethod('transfer')
    onClose()
  }

  const formatAmount = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

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
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">변동비 기입</SheetTitle>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {saveMutation.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* 항목 선택 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              📊 항목 선택 *
            </label>
            {variableItems.length === 0 ? (
              <div className="bg-[#FF6B35]/10 rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#FF6B35] font-semibold">등록된 변동비 항목이 없어요</p>
                <p className="text-[12px] text-[#FF6B35] mt-0.5">
                  정기지출 관리에서 항목을 먼저 추가해주세요
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {variableItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item)
                      if (!description) setDescription(item.name)
                    }}
                    className={cn(
                      'px-3 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
                      selectedItem?.id === item.id
                        ? 'border-[#FF6B35] bg-[#FF6B35]/10 text-[#FF6B35]'
                        : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 금액 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              금액 *
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(formatAmount(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-4 rounded-xl text-[24px] font-bold placeholder:text-[#C7C7CC] outline-none pr-10 bg-[#FF6B35]/10 text-[#FF6B35]"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
            </div>
          </div>

          {/* 적요 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              적요 *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 팀 회식, 출장 주유 등"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 날짜 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">날짜</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
            />
          </div>

          {/* 현장 연결 (선택) */}
          {projects.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                현장 연결 (선택)
              </label>
              <div className="relative">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl text-[15px] outline-none appearance-none font-medium',
                    projectId ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#F2F2F7] text-[#8E8E93]'
                  )}
                >
                  <option value="">현장 없음 (공통 비용)</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none">▼</span>
              </div>
            </div>
          )}

          {/* 결제 수단 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">결제 수단</label>
            <div className="flex gap-2">
              {[
                { value: 'transfer', label: '계좌이체' },
                { value: 'cash', label: '현금' },
                { value: 'card', label: '카드' },
                { value: 'other', label: '기타' },
              ].map((pm) => (
                <button
                  key={pm.value}
                  onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
                    paymentMethod === pm.value
                      ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                      : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                  )}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
