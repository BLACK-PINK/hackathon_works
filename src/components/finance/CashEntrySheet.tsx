'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  TRANSACTION_CATEGORY_LABELS,
  TRANSACTION_SUB_CATEGORIES,
  type TransactionCategory,
} from '@/types'

interface CashAccount {
  id: string
  name: string
  current_balance: number
}

interface CashEntrySheetProps {
  open: boolean
  onClose: () => void
  account: CashAccount
  profile: any
}

type EntryType = 'income' | 'expense'

// 지출에서 선택 가능한 카테고리
const EXPENSE_CATEGORIES: TransactionCategory[] = ['COGS', 'SITE_EXPENSE', 'SGA', 'TAX']

// 카테고리별 라벨 (간결하게)
const CAT_LABEL: Record<string, string> = {
  COGS: '매출원가',
  SITE_EXPENSE: '현장경비',
  SGA: '판매관리비',
  TAX: '세금',
}

export function CashEntrySheet({ open, onClose, account, profile }: CashEntrySheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [entryType, setEntryType] = useState<EntryType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hasVat, setHasVat] = useState(false)
  const [category, setCategory] = useState<TransactionCategory>('COGS')
  const [subCategory, setSubCategory] = useState('')

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

  // 카테고리 전환 시 세부분류 초기화
  const handleCategoryChange = (cat: TransactionCategory) => {
    setCategory(cat)
    setSubCategory('')
  }

  // 지출 카테고리에 따른 세부분류 목록
  const subCats = TRANSACTION_SUB_CATEGORIES[category] || []

  const saveEntry = useMutation({
    mutationFn: async () => {
      const numAmount = parseInt(amount.replace(/,/g, ''))
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!description.trim()) throw new Error('내용을 입력해주세요')

      const isIncome = entryType === 'income'

      const autoMemo = isIncome
        ? `시재 입금 | ${profile.name}`
        : `시재 기입 | ${profile.name}`

      const { error } = await supabase.from('transactions').insert({
        company_id: profile.company_id,
        type: isIncome ? 'income' : 'expense',
        category: isIncome ? 'NON_OPERATING' : category,
        sub_category: isIncome ? null : (subCategory || null),
        amount: numAmount,
        description: description.trim(),
        transaction_date: txDate,
        project_id: isIncome ? null : (projectId || null),
        cash_account_id: account.id,
        payment_method: 'cash',
        is_site_expense: !isIncome,
        is_internal_transfer: isIncome,   // 입금은 내부이동 → 손익 제외
        has_vat: hasVat,
        is_voided: false,
        created_by: profile.id,
        memo: autoMemo,
      })
      if (error) throw new Error(`저장 실패: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['cash-transactions', account.id] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['project-pl'] })
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'] })
      toast.success(entryType === 'income' ? '입금이 기입되었습니다' : '지출이 기입되었습니다')
      handleClose()
    },
    onError: (e: any) => toast.error(e.message),
  })

  const handleClose = () => {
    setEntryType('expense')
    setAmount('')
    setDescription('')
    setProjectId('')
    setTxDate(format(new Date(), 'yyyy-MM-dd'))
    setHasVat(false)
    setCategory('COGS')
    setSubCategory('')
    onClose()
  }

  const fmt = (v: string) => {
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
            <SheetTitle className="text-[17px] font-semibold">
              {account.name} 시재 기입
            </SheetTitle>
            <button
              onClick={() => saveEntry.mutate()}
              disabled={saveEntry.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {saveEntry.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* 현재 잔액 */}
          <div className="ios-card px-4 py-3 flex items-center justify-between bg-[#F2F2F7] rounded-xl">
            <span className="text-[13px] text-[#8E8E93]">현재 잔액</span>
            <span className={cn(
              'text-[18px] font-bold',
              account.current_balance >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'
            )}>
              {Number(account.current_balance).toLocaleString()}원
            </span>
          </div>

          {/* 입금 / 지출 토글 */}
          <div className="flex rounded-xl overflow-hidden border border-black/10">
            <button
              onClick={() => setEntryType('income')}
              className={cn(
                'flex-1 py-3 text-[15px] font-semibold transition-all',
                entryType === 'income' ? 'bg-[#34C759] text-white' : 'bg-white text-[#8E8E93]'
              )}
            >
              💰 입금
            </button>
            <button
              onClick={() => setEntryType('expense')}
              className={cn(
                'flex-1 py-3 text-[15px] font-semibold transition-all',
                entryType === 'expense' ? 'bg-[#FF3B30] text-white' : 'bg-white text-[#8E8E93]'
              )}
            >
              💸 지출
            </button>
          </div>

          {/* 입금 안내 */}
          {entryType === 'income' && (
            <div className="bg-[#34C759]/10 rounded-xl px-4 py-3">
              <p className="text-[12px] text-[#34C759] font-medium">
                💡 회사계좌 → 시재 입금은 내부 자금 이동으로 처리됩니다 (매출 아님)
              </p>
            </div>
          )}

          {/* ── 지출: 분류 선택 ── */}
          {entryType === 'expense' && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                분류 *
              </label>
              <div className="flex gap-2 flex-wrap">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryChange(cat)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
                      category === cat
                        ? cat === 'COGS'         ? 'border-[#FF3B30] bg-[#FF3B30]/10 text-[#FF3B30]'
                        : cat === 'SITE_EXPENSE' ? 'border-[#34C759] bg-[#34C759]/10 text-[#34C759]'
                        : cat === 'SGA'          ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        :                          'border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500]'
                        : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                    )}
                  >
                    {cat === 'COGS'         ? '🔧 매출원가'
                    : cat === 'SITE_EXPENSE' ? '🧃 현장경비'
                    : cat === 'SGA'          ? '🏢 판매관리비'
                    :                          '🧾 세금'}
                  </button>
                ))}
              </div>
              {/* 분류별 안내 */}
              <p className="text-[11px] text-[#8E8E93] mt-1.5 px-1">
                {category === 'COGS'         ? '현장 자재·외주·시공비 등 직접 공사비용'
                : category === 'SITE_EXPENSE' ? '현장 물/음료/간식/소모품 등 현장 운영비'
                : category === 'SGA'          ? '사무실 운영·급여·광고 등 관리비용'
                :                               '부가세·소득세 등 세금 납부'}
              </p>
            </div>
          )}

          {/* ── 지출: 세부 분류 ── */}
          {entryType === 'expense' && subCats.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                세부 분류
              </label>
              <div className="flex gap-2 flex-wrap">
                {subCats.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSubCategory(subCategory === sub ? '' : sub)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all',
                      subCategory === sub
                        ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 현장 선택 (지출만, 선택) */}
          {entryType === 'expense' && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                🏗️ 현장 연결 <span className="text-[#8E8E93] normal-case">(선택)</span>
              </label>
              <div className="relative">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl text-[15px] outline-none appearance-none font-medium',
                    projectId
                      ? 'bg-[#007AFF]/10 text-[#007AFF]'
                      : 'bg-[#F2F2F7] text-[#8E8E93]'
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

          {/* 금액 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              {entryType === 'income' ? '입금' : '지출'} 금액 *
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(fmt(e.target.value))}
                placeholder="0"
                className={cn(
                  'w-full px-4 py-4 rounded-xl text-[24px] font-bold placeholder:text-[#C7C7CC] outline-none pr-10',
                  entryType === 'income'
                    ? 'bg-[#34C759]/10 text-[#34C759]'
                    : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                )}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93]">원</span>
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              {entryType === 'income' ? '입금' : '지출'} 내용 *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                entryType === 'income' ? '예: 본사 지급, 현장 지원금'
                : category === 'SITE_EXPENSE' ? '예: 현장 음료수 구입, 간식비'
                : category === 'SGA' ? '예: 사무용품 구입, 통신비'
                : '예: 자재 구매, 인건비 지급'
              }
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

          {/* 부가세 발행 */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-[#F2F2F7]">
            <div>
              <p className="text-[14px] font-medium text-black">부가세 발행</p>
              <p className="text-[12px] text-[#8E8E93]">세금계산서 / 영수증 발행 여부</p>
            </div>
            <button
              onClick={() => setHasVat(!hasVat)}
              className={cn(
                'w-12 h-7 rounded-full transition-all duration-200 relative',
                hasVat ? 'bg-[#007AFF]' : 'bg-[#E5E5EA]'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200',
                hasVat ? 'left-[22px]' : 'left-0.5'
              )} />
            </button>
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
