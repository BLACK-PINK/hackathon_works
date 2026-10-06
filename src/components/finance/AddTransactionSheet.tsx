'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TRANSACTION_CATEGORY_LABELS, TRANSACTION_SUB_CATEGORIES } from '@/types'
import { format } from 'date-fns'

interface AddTransactionSheetProps {
  open: boolean
  onClose: () => void
  profile: any
}

// 거래 모드: 수입 / 지출 / 시재이동(내부 자금 이동)
type TxMode = 'income' | 'expense' | 'cash-move'
type TxCategory = 'REVENUE' | 'COGS' | 'SGA' | 'NON_OPERATING' | 'TAX' | 'SITE_EXPENSE'

const INCOME_CATEGORIES: TxCategory[] = ['REVENUE', 'NON_OPERATING']
const EXPENSE_CATEGORIES: TxCategory[] = ['COGS', 'SGA', 'SITE_EXPENSE', 'TAX']

// COGS에서 시재지급 제거 (시재이동 모드로 분리)
const COGS_SUB_WITHOUT_CASH = TRANSACTION_SUB_CATEGORIES['COGS'].filter(s => s !== '시재지급')

export function AddTransactionSheet({ open, onClose, profile }: AddTransactionSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 모드: 수입 / 지출 / 시재이동
  const [txMode, setTxMode] = useState<TxMode>('income')
  const [category, setCategory] = useState<TxCategory>('REVENUE')
  const [subCategory, setSubCategory] = useState('')
  const [supplyAmount, setSupplyAmount] = useState('')   // 공급가
  const [vatAmount, setVatAmount] = useState('')         // 부가세
  const [vatType, setVatType] = useState<'issued' | 'not_issued'>('not_issued')  // 부가세 발행 여부
  const [description, setDescription] = useState('')
  const [memo, setMemo] = useState('')
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [projectId, setProjectId] = useState('')
  const [cashAccountId, setCashAccountId] = useState('')   // 시재이동: 출처 or 연결 계좌
  const [paymentMethod, setPaymentMethod] = useState('transfer')

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
  })

  const { data: cashAccounts = [] } = useQuery({
    queryKey: ['cash-accounts', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_accounts')
        .select('id, name, user_id')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
      return data || []
    },
  })

  // 변동경비 항목 목록 (SGA 세부분류로 사용)
  const { data: sgaVariableItems = [] } = useQuery({
    queryKey: ['recurring-expenses', profile.company_id, 'variable'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'variable')
        .eq('is_active', true)
        .order('name')
      return data || []
    },
  })

  // 모드 전환
  const handleModeChange = (mode: TxMode) => {
    setTxMode(mode)
    setSubCategory('')
    if (mode === 'income') {
      setCategory('REVENUE')
      setPaymentMethod('transfer')
    } else if (mode === 'expense') {
      setCategory('COGS')
      setPaymentMethod('transfer')
    } else {
      // 시재이동: 결제수단 현금 고정
      setCategory('NON_OPERATING')
      setPaymentMethod('cash')
      setProjectId('')
    }
  }

  // 공급가 입력 시 부가세 자동계산 (vatType === 'issued'일 때만)
  const handleSupplyChange = (v: string) => {
    const num = v.replace(/\D/g, '')
    setSupplyAmount(num ? parseInt(num).toLocaleString() : '')
    if (vatType === 'issued' && num) {
      const vat = Math.round(parseInt(num) * 0.1)
      setVatAmount(vat.toLocaleString())
    } else {
      setVatAmount('')
    }
  }

  // 부가세 발행 토글
  const handleVatTypeChange = (issued: boolean) => {
    const next = issued ? 'issued' : 'not_issued'
    setVatType(next)
    if (issued && supplyAmount) {
      const supply = parseInt(supplyAmount.replace(/,/g, '')) || 0
      setVatAmount(Math.round(supply * 0.1).toLocaleString())
    } else {
      setVatAmount('')
    }
  }

  // UI 합계 표시용 (공급가 + 부가세) — 실제 수취/지급 총액 안내용
  const totalDisplay = (() => {
    const supply = parseInt(supplyAmount.replace(/,/g, '')) || 0
    const vat = vatType === 'issued' ? (parseInt(vatAmount.replace(/,/g, '')) || 0) : 0
    return supply + vat
  })()

  // 실제 DB에 저장할 type 결정
  // 시재이동: 받는 시재 계좌에 +입금 처리되어야 하므로 'income'으로 저장
  // (DB 트리거: income → current_balance + amount)
  const dbType = txMode === 'expense' ? 'expense' : 'income'
  // 시재이동 = is_internal_transfer: true → 손익 완전 제외
  const isInternalTransfer = txMode === 'cash-move'

  // 현재 모드에 맞는 카테고리 목록
  const categories = txMode === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  // COGS 세부분류: 시재이동 모드가 아닐 때는 시재지급 제거
  // SGA: 변동경비 항목(recurring_expenses) 목록으로 교체
  const getSubCategories = (cat: TxCategory): string[] => {
    if (cat === 'COGS') return COGS_SUB_WITHOUT_CASH
    if (cat === 'SGA') return sgaVariableItems.map((i: any) => i.name)
    return TRANSACTION_SUB_CATEGORIES[cat] || []
  }

  const addTransaction = useMutation({
    mutationFn: async () => {
      const supply = parseInt(supplyAmount.replace(/,/g, '')) || 0
      const vat = vatType === 'issued' ? (parseInt(vatAmount.replace(/,/g, '')) || 0) : 0

      // 원장 amount = 공급가만 (부가세는 vat_amount에 별도 기록)
      if (!supply || supply <= 0) throw new Error('공급가를 입력해주세요')
      if (!description.trim()) throw new Error('적요를 입력해주세요')

      // 시재이동: 시재 계좌 필수
      if (txMode === 'cash-move' && !cashAccountId) {
        throw new Error('시재이동은 시재 계좌를 반드시 선택해주세요')
      }

      // SGA: 세부분류 필수
      if (category === 'SGA' && !subCategory) {
        throw new Error('판관비는 항목을 반드시 선택해주세요')
      }

      // SGA 저장 시 → recurring_expenses에 없는 항목이면 자동 추가
      if (category === 'SGA' && subCategory) {
        const exists = sgaVariableItems.some((i: any) => i.name === subCategory)
        if (!exists) {
          await supabase.from('recurring_expenses').insert({
            company_id: profile.company_id,
            name: subCategory,
            expense_type: 'variable',
            sub_category: 'SGA',
            amount: 0,
            is_active: true,
            created_by: profile.id,
          })
          queryClient.invalidateQueries({ queryKey: ['recurring-expenses', profile.company_id, 'variable'] })
        }
      }

      // 원장 직접 등록 자동 메모 (사용자 입력 메모가 있으면 앞에 붙임)
      const autoMemoPrefix = `원장 등록 | ${profile.name}`
      const finalMemo = memo.trim()
        ? `${autoMemoPrefix} | ${memo.trim()}`
        : autoMemoPrefix

      const { error } = await supabase.from('transactions').insert({
        company_id: profile.company_id,
        type: dbType,
        category: txMode === 'cash-move' ? 'NON_OPERATING' : category,
        sub_category: txMode === 'cash-move' ? '시재이동' : (subCategory || null),
        supply_amount: supply,
        vat_amount: vat,
        vat_type: txMode === 'cash-move' ? 'not_issued' : vatType,
        amount: supply,                               // 원장 = 공급가만 (부가세는 vat_amount 별도)
        has_vat: vatType === 'issued',
        description: description.trim(),
        memo: finalMemo,
        transaction_date: txDate,
        project_id: (projectId && projectId !== '__none__') ? projectId : null,
        cash_account_id: cashAccountId || null,
        payment_method: txMode === 'cash-move' ? 'cash' : paymentMethod,
        is_site_expense: false,
        is_internal_transfer: isInternalTransfer,   // 시재이동이면 true → 손익 제외
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
      queryClient.invalidateQueries({ queryKey: ['cash-accounts'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['variable-tx'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['sga-summary'], exact: false })
      const modeLabel = txMode === 'income' ? '수입' : txMode === 'expense' ? '지출' : '시재이동'
      toast.success(`${modeLabel}이 등록되었습니다`)
      handleClose()
    },
    onError: (e: any) => toast.error(e.message || '등록에 실패했습니다'),
  })

  const handleClose = () => {
    setTxMode('income')
    setCategory('REVENUE')
    setSubCategory('')
    setSupplyAmount('')
    setVatAmount('')
    setVatType('not_issued')
    setDescription('')
    setMemo('')
    setTxDate(format(new Date(), 'yyyy-MM-dd'))
    setProjectId('')
    setCashAccountId('')
    setPaymentMethod('transfer')
    onClose()
  }

  const formatNum = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  // 금액 입력창 색상
  const amountColor =
    txMode === 'income' ? 'bg-[#34C759]/10 text-[#34C759]'
    : txMode === 'expense' ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
    : 'bg-[#FF9500]/10 text-[#FF9500]'

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
            <SheetTitle className="text-[17px] font-semibold">거래 입력</SheetTitle>
            <button
              onClick={() => addTransaction.mutate()}
              disabled={addTransaction.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {addTransaction.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* ── 거래 유형 3탭 ── */}
          <div className="flex rounded-xl overflow-hidden border border-black/10">
            <button
              onClick={() => handleModeChange('income')}
              className={cn(
                'flex-1 py-3 text-[14px] font-bold transition-all',
                txMode === 'income' ? 'bg-[#34C759] text-white' : 'bg-white text-[#8E8E93]'
              )}
            >
              💰 수입
            </button>
            <button
              onClick={() => handleModeChange('expense')}
              className={cn(
                'flex-1 py-3 text-[14px] font-bold transition-all border-x border-black/10',
                txMode === 'expense' ? 'bg-[#FF3B30] text-white' : 'bg-white text-[#8E8E93]'
              )}
            >
              💸 지출
            </button>
            <button
              onClick={() => handleModeChange('cash-move')}
              className={cn(
                'flex-1 py-3 text-[14px] font-bold transition-all',
                txMode === 'cash-move' ? 'bg-[#FF9500] text-white' : 'bg-white text-[#8E8E93]'
              )}
            >
              🏦 시재이동
            </button>
          </div>

          {/* ── 시재이동 안내 배너 ── */}
          {txMode === 'cash-move' && (
            <div className="bg-[#FF9500]/10 rounded-xl px-4 py-3 space-y-1">
              <p className="text-[13px] text-[#FF9500] font-semibold">🏦 시재이동이란?</p>
              <p className="text-[12px] text-[#FF9500]">
                회사 → 팀원 시재 지급, 팀원 간 이동 등<br />
                <strong>손익에 포함되지 않습니다</strong> (내부 자금 이동)
              </p>
            </div>
          )}

          {/* ── 현장 선택 (시재이동 제외) ── */}
          {txMode !== 'cash-move' && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                🏗️ 현장 선택
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
                  <option value="">현장을 선택하세요</option>
                  <option value="__none__">📌 현장 없음 (공통 비용)</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none">▼</span>
              </div>
            </div>
          )}

          {/* ── 금액 (공급가 + 부가세) ── */}
          <div className="space-y-2">
            {/* 공급가 입력 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                공급가 *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={supplyAmount}
                  onChange={(e) => handleSupplyChange(e.target.value)}
                  placeholder="0"
                  className={cn(
                    'w-full px-4 py-4 rounded-xl text-[24px] font-bold placeholder:text-[#C7C7CC] outline-none pr-10',
                    amountColor
                  )}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
              </div>
            </div>

            {/* 부가세 발행 체크박스 */}
            <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer select-none">
              <div
                onClick={() => handleVatTypeChange(vatType !== 'issued')}
                className={cn(
                  'w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0',
                  vatType === 'issued'
                    ? 'bg-[#007AFF] border-[#007AFF]'
                    : 'bg-white border-[#C7C7CC]'
                )}
              >
                {vatType === 'issued' && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-[14px] font-medium text-[#3C3C43]">부가세 발행 (공급가의 10% 자동 계산)</span>
            </label>

            {/* 부가세 입력 (체크 시 노출) */}
            {vatType === 'issued' && (
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                  부가세
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={vatAmount}
                    onChange={(e) => setVatAmount(formatNum(e.target.value))}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[18px] font-bold text-[#007AFF] placeholder:text-[#C7C7CC] outline-none pr-10"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
                </div>
              </div>
            )}

            {/* 합계 표시 */}
            {supplyAmount && (
              <div className="space-y-1.5">
                {/* 원장 등록 금액 (공급가만) */}
                <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-[#F2F2F7]">
                  <span className="text-[13px] text-[#8E8E93]">원장 등록 금액 (공급가)</span>
                  <span className="text-[15px] font-bold text-[#3C3C43]">
                    {(parseInt(supplyAmount.replace(/,/g, '')) || 0).toLocaleString()}원
                  </span>
                </div>
                {/* 실제 수취/지급 총액 (참고용) */}
                {vatType === 'issued' && (
                  <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-[#007AFF]/8">
                    <span className="text-[13px] text-[#007AFF]">실제 수취/지급 총액</span>
                    <span className="text-[15px] font-bold text-[#007AFF]">
                      {totalDisplay.toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 적요 ── */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              적요 *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                txMode === 'income' ? '예: 공사대금 수령, 계약금 입금'
                : txMode === 'expense' ? '예: 자재비 지출, 외주 시공비'
                : '예: 남유정팀장 시재 지급, 현장 경비 지원'
              }
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* ── 분류 (수입/지출만) ── */}
          {txMode !== 'cash-move' && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">분류</label>
              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setCategory(cat); setSubCategory('') }}
                    className={cn(
                      'px-3 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
                      category === cat
                        ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                    )}
                  >
                    {TRANSACTION_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 세부 분류 (수입/지출만) ── */}
          {txMode !== 'cash-move' && (category === 'SGA' || getSubCategories(category).length > 0) && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">
                  {category === 'SGA' ? '판관비 항목' : '세부 분류'}
                </label>
                {category === 'SGA' && (
                  <span className="text-[10px] font-semibold text-white bg-[#FF3B30] px-1.5 py-0.5 rounded-full">필수</span>
                )}
              </div>
              {category === 'SGA' && sgaVariableItems.length === 0 ? (
                <div className="px-4 py-3 bg-[#F2F2F7] rounded-xl text-[13px] text-[#8E8E93] text-center">
                  판관비 탭 → 변동경비 → 항목 수정에서 항목을 먼저 추가해주세요
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {getSubCategories(category).map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSubCategory(subCategory === sub ? '' : sub)}
                      className={cn(
                        'px-3 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
                        subCategory === sub
                          ? category === 'SGA'
                            ? 'border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500]'
                            : 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                          : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 날짜 ── */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">날짜</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
            />
          </div>

          {/* ── 결제 수단 (수입/지출만) ── */}
          {txMode !== 'cash-move' && (
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
          )}

          {/* ── 시재 계좌 연결 ── */}
          {cashAccounts.length > 0 && (
            <div>
              <label className={cn(
                'text-[12px] font-medium uppercase tracking-wide mb-1.5 block',
                txMode === 'cash-move' ? 'text-[#FF9500]' : 'text-[#8E8E93]'
              )}>
                {txMode === 'cash-move' ? '🏦 시재 계좌 * (필수)' : '시재 연결 (선택)'}
              </label>
              <div className="relative">
                <select
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl text-[15px] outline-none appearance-none font-medium',
                    txMode === 'cash-move' && !cashAccountId
                      ? 'bg-[#FF9500]/10 text-[#FF9500] border-2 border-[#FF9500]/30'
                      : cashAccountId
                      ? 'bg-[#007AFF]/10 text-[#007AFF]'
                      : 'bg-[#F2F2F7] text-[#8E8E93]'
                  )}
                >
                  <option value="">
                    {txMode === 'cash-move' ? '입금될 시재 계좌 선택' : '시재 선택 안 함'}
                  </option>
                  {cashAccounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none">▼</span>
              </div>
              {txMode === 'cash-move' && cashAccountId && (
                <p className="text-[12px] text-[#FF9500] mt-1.5 pl-1">
                  ✓ 선택된 시재 계좌 잔액이 자동으로 증가합니다
                </p>
              )}
            </div>
          )}

          {/* ── 메모 ── */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 (선택)"
              rows={2}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
            />
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
