'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { X, Pencil, Check } from 'lucide-react'

interface CashAccount {
  id: string
  name: string
  current_balance: number
  initial_balance: number
}

interface CashDetailSheetProps {
  open: boolean
  onClose: () => void
  account: CashAccount
  profile: any
}

export function CashDetailSheet({ open, onClose, account, profile }: CashDetailSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editHasVat, setEditHasVat] = useState(false)

  // 거래내역 조회
  const { data: transactions = [], refetch } = useQuery({
    queryKey: ['cash-transactions', account.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, category, amount, description, transaction_date, is_internal_transfer, has_vat, is_voided, created_at, project:projects(id, name), is_modified')
        .eq('cash_account_id', account.id)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // 수정 저장
  const updateTx = useMutation({
    mutationFn: async (txId: string) => {
      const numAmount = parseInt(editAmount.replace(/,/g, ''))
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!editDescription.trim()) throw new Error('내용을 입력해주세요')

      const { error } = await supabase
        .from('transactions')
        .update({
          amount: numAmount,
          description: editDescription.trim(),
          has_vat: editHasVat,
          is_modified: true,
        })
        .eq('id', txId)
      if (error) throw new Error(`수정 실패: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-transactions', account.id] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['project-pl'] })
      toast.success('수정되었습니다')
      setEditingId(null)
    },
    onError: (e: any) => toast.error(e.message),
  })

  const startEdit = (tx: any) => {
    setEditingId(tx.id)
    setEditAmount(Number(tx.amount).toLocaleString())
    setEditDescription(tx.description)
    setEditHasVat(tx.has_vat ?? false)
  }

  const cancelEdit = () => setEditingId(null)

  const fmt = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  const isToday = (dateStr: string) => dateStr === today

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
            <SheetTitle className="text-[17px] font-semibold">{account.name} 거래내역</SheetTitle>
            <div className="w-10" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* 잔액 요약 */}
          <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-black/5">
            <div className="ios-card p-3 text-center">
              <p className="text-[11px] text-[#8E8E93] mb-1">초기 잔액</p>
              <p className="text-[14px] font-semibold text-black">
                {Number(account.initial_balance || 0).toLocaleString()}원
              </p>
            </div>
            <div className="ios-card p-3 text-center bg-[#007AFF]">
              <p className="text-[11px] text-white/80 mb-1">현재 잔액</p>
              <p className="text-[14px] font-bold text-white">
                {Number(account.current_balance).toLocaleString()}원
              </p>
            </div>
            <div className="ios-card p-3 text-center">
              <p className="text-[11px] text-[#8E8E93] mb-1">거래 건수</p>
              <p className="text-[14px] font-semibold text-black">{transactions.length}건</p>
            </div>
          </div>

          {/* 거래내역 목록 */}
          <div className="px-4 py-3 space-y-2">
            {transactions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[32px] mb-2">📋</p>
                <p className="text-[14px] text-[#8E8E93]">거래내역이 없습니다</p>
              </div>
            ) : (
              transactions.map((tx: any) => {
                const isEditing = editingId === tx.id
                const canEdit = isToday(tx.transaction_date)
                const isIncome = tx.type === 'income'

                return (
                  <div
                    key={tx.id}
                    className={cn(
                      'ios-card p-4',
                      isEditing && 'ring-2 ring-[#007AFF]'
                    )}
                  >
                    {isEditing ? (
                      /* 수정 모드 */
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            'text-[12px] font-semibold px-2 py-0.5 rounded-full',
                            isIncome ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                          )}>
                            {isIncome ? '입금' : '지출'} 수정중
                          </span>
                          <button onClick={cancelEdit}>
                            <X className="w-4 h-4 text-[#8E8E93]" />
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editAmount}
                            onChange={(e) => setEditAmount(fmt(e.target.value))}
                            className={cn(
                              'w-full px-3 py-3 rounded-xl text-[20px] font-bold outline-none pr-8',
                              isIncome ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                            )}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
                        </div>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditHasVat(!editHasVat)}
                              className={cn(
                                'w-10 h-6 rounded-full transition-all relative',
                                editHasVat ? 'bg-[#007AFF]' : 'bg-[#E5E5EA]'
                              )}
                            >
                              <div className={cn(
                                'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                                editHasVat ? 'left-[18px]' : 'left-0.5'
                              )} />
                            </button>
                            <span className="text-[13px] text-[#8E8E93]">부가세 발행</span>
                          </div>
                          <button
                            onClick={() => updateTx.mutate(tx.id)}
                            disabled={updateTx.isPending}
                            className="flex items-center gap-1 px-4 py-2 bg-[#007AFF] text-white rounded-xl text-[13px] font-semibold disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" />
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 일반 표시 모드 */
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className={cn(
                                'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                                isIncome ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                              )}>
                                {isIncome ? '입금' : '지출'}
                              </span>
                              {/* 분류 뱃지 (지출만) */}
                              {!isIncome && tx.category === 'COGS' && (
                                <span className="text-[11px] bg-[#FF3B30]/12 text-[#FF3B30] px-2 py-0.5 rounded-full font-semibold">
                                  매출원가
                                </span>
                              )}
                              {!isIncome && tx.category === 'SITE_EXPENSE' && (
                                <span className="text-[11px] bg-[#FF9500]/12 text-[#FF9500] px-2 py-0.5 rounded-full font-semibold">
                                  현장경비
                                </span>
                              )}
                              {!isIncome && tx.category === 'SGA' && (
                                <span className="text-[11px] bg-[#007AFF]/12 text-[#007AFF] px-2 py-0.5 rounded-full font-semibold">
                                  판관비
                                </span>
                              )}
                              {!isIncome && tx.category === 'TAX' && (
                                <span className="text-[11px] bg-[#FF2D55]/12 text-[#FF2D55] px-2 py-0.5 rounded-full font-semibold">
                                  세금
                                </span>
                              )}
                              {tx.is_internal_transfer && (
                                <span className="text-[11px] bg-[#8E8E93]/15 text-[#8E8E93] px-2 py-0.5 rounded-full font-medium">
                                  내부이동
                                </span>
                              )}
                              {tx.has_vat && (
                                <span className="text-[11px] bg-[#007AFF]/15 text-[#007AFF] px-2 py-0.5 rounded-full font-medium">
                                  부가세
                                </span>
                              )}
                              {tx.is_modified && (
                                <span className="text-[11px] bg-gray-100 text-[#8E8E93] px-2 py-0.5 rounded-full font-medium">
                                  수정됨
                                </span>
                              )}
                            </div>
                            <p className="text-[14px] font-medium text-black truncate">{tx.description}</p>
                            <p className="text-[11px] text-[#8E8E93] mt-0.5">
                              {format(new Date(tx.transaction_date), 'M월 d일 (E)', { locale: ko })}
                              {tx.project?.name && (
                                <span className="ml-1.5 text-[#007AFF]">· {tx.project.name}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'text-[16px] font-bold',
                              isIncome ? 'text-[#34C759]' : 'text-[#FF3B30]'
                            )}>
                              {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()}원
                            </p>
                            {canEdit && (
                              <button
                                onClick={() => startEdit(tx)}
                                className="w-7 h-7 flex items-center justify-center bg-[#F2F2F7] rounded-lg active:opacity-60"
                              >
                                <Pencil className="w-3.5 h-3.5 text-[#8E8E93]" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
