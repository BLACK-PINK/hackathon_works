'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { Plus, TrendingUp, TrendingDown, Wallet, ChevronDown, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AddTransactionSheet } from '@/components/finance/AddTransactionSheet'
import { CashEntrySheet } from '@/components/finance/CashEntrySheet'
import { CashDetailSheet } from '@/components/finance/CashDetailSheet'
import { SgaTab } from '@/components/finance/SgaTab'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import type { RecurringExpense } from '@/types'
import { TRANSACTION_CATEGORY_LABELS, TRANSACTION_SUB_CATEGORIES } from '@/types'

// ─────────────────────────────────────────────────────────
// 클립보드 복사 헬퍼
// navigator.clipboard API 우선, 실패 시 execCommand 폴백
// (은행 사이트 등 다른 탭에서 붙여넣기가 안 되는 문제 방지)
// ─────────────────────────────────────────────────────────
function copyToClipboard(text: string): Promise<void> {
  // 1차: 최신 Clipboard API 시도
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  }
  // 2차: 구형 execCommand 폴백
  return fallbackCopy(text)
}

function fallbackCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    // 화면 밖으로 숨김
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;'
    document.body.appendChild(el)
    el.focus()
    el.select()
    el.setSelectionRange(0, el.value.length) // iOS 대응
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    ok ? resolve() : reject(new Error('execCommand copy failed'))
  })
}

// ─────────────────────────────────────────────────────────
// 오버라이드 누적 적용 헬퍼 (FinancePageClient 전용)
// SgaTab의 getEffectiveFixedItems와 동일 로직
// ─────────────────────────────────────────────────────────
function getEffectiveFixedItemsFPC(baseItems: any[], overrides: any[], targetMonth: string): any[] {
  const applicable = overrides
    .filter((o) => o.effective_month <= targetMonth)
    .sort((a, b) => a.effective_month.localeCompare(b.effective_month))

  const itemMap = new Map<string, any>()
  for (const item of baseItems) {
    itemMap.set(item.id, { ...item })
  }
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
      const virtualId = `override_${o.id}`
      addedMap.set(virtualId, {
        id: virtualId,
        name: o.name ?? '신규항목',
        amount: o.amount ?? 0,
        billing_day: o.billing_day ?? 25,
      })
    }
  }

  return [
    ...Array.from(itemMap.values()),
    ...Array.from(addedMap.values()),
  ]
}

interface FinancePageClientProps {
  profile: any
  initialTab?: FinanceTab
}

type FinanceTab = 'dashboard' | 'cash' | 'ledger' | 'payment-schedule' | 'revenue-schedule' | 'sga' | 'project-pl' | 'company-pl'

const financeSubTabs = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'cash', label: '시재' },
  { id: 'ledger', label: '원장' },
  { id: 'payment-schedule', label: '결제예정' },
  { id: 'revenue-schedule', label: '매출예정' },
  { id: 'sga', label: '판관비' },
  { id: 'project-pl', label: '현장손익' },
  { id: 'company-pl', label: '회사손익' },
]

export function FinancePageClient({ profile, initialTab }: FinancePageClientProps) {
  const [activeTab, setActiveTab] = useState<FinanceTab>(initialTab ?? 'dashboard')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('') // '' = 전체
  const supabase = createClient()

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  // 현장 목록
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .order('name')
      return data || []
    },
  })

  // 고정비 base 항목 목록 (recurring_expenses)
  // 현장 필터 무관: 고정비는 회사 전체 비용
  const { data: recurringBaseItems = [] } = useQuery({
    queryKey: ['recurring-base-items', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount, billing_day')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return data || []
    },
  })

  // 고정비 월별 오버라이드
  const { data: recurringOverrides = [] } = useQuery({
    queryKey: ['recurring-overrides', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expense_overrides')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('effective_month', { ascending: true })
      return data || []
    },
  })

  // 현재 달 기준 고정비 합계 (오버라이드 적용)
  const currentMonthKey = format(currentMonth, 'yyyy-MM')
  const recurringFixedTotal = (() => {
    const items = getEffectiveFixedItemsFPC(recurringBaseItems, recurringOverrides, currentMonthKey)
    return items.reduce((s: number, i: any) => s + Number(i.amount), 0)
  })()

  // 월별 거래 요약 — 대시보드는 항상 전체(현장필터 무시), 다른 탭은 필터 적용
  const summaryProjectId = activeTab === 'dashboard' ? '' : selectedProjectId
  const { data: summary } = useQuery({
    queryKey: ['finance-summary', profile.company_id, monthStart, monthEnd, summaryProjectId],
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select('type, category, amount, is_voided, is_internal_transfer, description')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
      if (summaryProjectId) q = q.eq('project_id', summaryProjectId)
      const { data, error } = await q
      if (error) throw error

      // is_internal_transfer=true인 거래는 손익 계산에서 제외 (내부 자금 이동)
      const pl = data?.filter((t) => !t.is_internal_transfer) ?? []

      const revenue = pl
        .filter((t) => t.category === 'REVENUE')
        .reduce((s, t) => s + Number(t.amount), 0)
      const cogs = pl
        .filter((t) => t.category === 'COGS')
        .reduce((s, t) => s + Number(t.amount), 0)
      const siteExpense = pl
        .filter((t) => t.category === 'SITE_EXPENSE')
        .reduce((s, t) => s + Number(t.amount), 0)
      // SGA: 고정(정기) + 변동(비정기) 모두 transactions 기준으로 실적 집계
      const sgaFixed_m = pl
        .filter((t) => t.category === 'SGA' && t.description?.startsWith('[정기]'))
        .reduce((s, t) => s + Number(t.amount), 0)
      const sgaVariable = pl
        .filter((t) => t.category === 'SGA' && !t.description?.startsWith('[정기]'))
        .reduce((s, t) => s + Number(t.amount), 0)
      const nonOp = pl
        .filter((t) => t.category === 'NON_OPERATING' && t.type === 'income')
        .reduce((s, t) => s + Number(t.amount), 0)
      const tax = pl
        .filter((t) => t.category === 'TAX')
        .reduce((s, t) => s + Number(t.amount), 0)

      // sga 실적 = 고정(정기) + 변동(비정기) 모두 transactions 기준
      return { revenue, cogs, siteExpense, sgaFixed: sgaFixed_m, sgaVariable, nonOp, tax }
    },
  })

  // summary.sga = recurring 고정비(오버라이드 적용) + transactions 변동비 (SgaTab과 동일)
  // sgaFixed: 현재 달 기준 오버라이드 적용된 고정비 합계 (recurringFixedTotal)
  const summaryWithSga = summary
    ? (() => {
        const sgaFixed = recurringFixedTotal  // 오버라이드 적용 고정비
        const sga = sgaFixed + (summary.sgaVariable ?? 0)
        const grossProfit = summary.revenue - summary.cogs - (summary.siteExpense ?? 0)
        const operatingProfit = grossProfit - sga
        const netProfit = operatingProfit + summary.nonOp - summary.tax
        return { ...summary, sgaFixed, sga, grossProfit, operatingProfit, netProfit }
      })()
    : null

  // (최근거래 쿼리 제거 - 대시보드에서 현금흐름 카드로 대체)

  const fmt = (n: number) =>
    n >= 0
      ? `+${n.toLocaleString()}원`
      : `${n.toLocaleString()}원`

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="재무"
        subtitle={`${format(currentMonth, 'yyyy년 M월', { locale: ko })}`}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>
        }
      />

      {/* 서브 탭 */}
      <div className="bg-white border-b border-black/5 overflow-x-auto">
        <div className="flex px-2 min-w-max">
          {financeSubTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as FinanceTab)}
              className={cn(
                'px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'text-[#007AFF] border-[#007AFF]'
                  : 'text-[#8E8E93] border-transparent'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 월 선택기 - 시재/현장손익 탭에서는 숨김 */}
      {!(['cash', 'project-pl'] as FinanceTab[]).includes(activeTab) && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-black/5 flex-shrink-0">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="text-[#007AFF] text-[14px] font-medium active:opacity-60 px-2"
          >
            ‹ 이전달
          </button>
          <p className="text-[15px] font-semibold text-black">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </p>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="text-[#007AFF] text-[14px] font-medium active:opacity-60 px-2"
            disabled={
              // 매출예정 탭은 미래달 이동 허용, 그 외 탭은 현재달까지만
              !(['revenue-schedule'] as FinanceTab[]).includes(activeTab) &&
              format(addMonths(currentMonth, 1), 'yyyy-MM') > format(new Date(), 'yyyy-MM')
            }
          >
            다음달 ›
          </button>
        </div>
      )}

      {/* 현장 필터 — 대시보드/시재/판관비/현장손익 탭에서는 숨김 */}
      {!(['dashboard', 'cash', 'sga', 'project-pl'] as FinanceTab[]).includes(activeTab) && (
        <div className={cn(
          'bg-white border-b border-black/5 px-4 py-2 flex-shrink-0',
          activeTab === 'revenue-schedule' && 'md:hidden'  // PC 매출예정: 현장선택 드롭다운 숨김
        )}>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={cn(
                'w-full px-4 py-2.5 rounded-xl text-[14px] outline-none appearance-none font-medium pr-8',
                selectedProjectId
                  ? 'bg-[#007AFF]/10 text-[#007AFF]'
                  : 'bg-[#F2F2F7] text-[#8E8E93]'
              )}
            >
              <option value="">🏗️ 전체 현장</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none text-[12px]">▼</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-safe">
        {activeTab === 'dashboard' && (
          <DashboardTab
            summary={summaryWithSga}
            profile={profile}
            monthStart={monthStart}
            monthEnd={monthEnd}
            recurringBaseItems={recurringBaseItems}
            recurringOverrides={recurringOverrides}
            currentMonthKey={currentMonthKey}
          />
        )}
        {activeTab === 'cash' && (
          <CashTab profile={profile} />
        )}
        {activeTab === 'ledger' && (
          <LedgerTab
            profile={profile}
            selectedProjectId={selectedProjectId}
            monthStart={monthStart}
            monthEnd={monthEnd}
            currentMonth={currentMonth}
          />
        )}
        {activeTab === 'payment-schedule' && (
          <CashFlowTab
            profile={profile}
            flowType="payment"
            currentMonth={currentMonth}
            projects={projects}
            selectedProjectId={selectedProjectId}
          />
        )}
        {activeTab === 'revenue-schedule' && (
          <CashFlowTab
            profile={profile}
            flowType="revenue"
            currentMonth={currentMonth}
            projects={projects}
            selectedProjectId={selectedProjectId}
          />
        )}
        {activeTab === 'sga' && (
          <SgaTab
            profile={profile}
            monthStart={monthStart}
            monthEnd={monthEnd}
            currentMonth={currentMonth}
          />
        )}
        {activeTab === 'project-pl' && (
          <ProjectPLTab
            profile={profile}
          />
        )}
        {activeTab === 'company-pl' && (
          <CompanyPLTab
            summary={summaryWithSga}
            profile={profile}
            monthStart={monthStart}
            monthEnd={monthEnd}
            currentMonth={currentMonth}
            recurringFixedTotal={recurringFixedTotal}
            recurringBaseItems={recurringBaseItems}
            recurringOverrides={recurringOverrides}
          />
        )}
      </div>

      {/* 거래 추가 Sheet */}
      <AddTransactionSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        profile={profile}
      />
    </div>
  )
}

// ─── 대시보드 ───────────────────────────────
function DashboardTab({
  summary,
  profile,
  monthStart,
  monthEnd,
  recurringBaseItems = [],
  recurringOverrides = [],
  currentMonthKey = '',
}: {
  summary: any
  profile: any
  monthStart: string
  monthEnd: string
  recurringBaseItems?: any[]
  recurringOverrides?: any[]
  currentMonthKey?: string
}) {
  const supabase = createClient()
  const [calMonth, setCalMonth] = useState(new Date())
  const calMonthStart = format(startOfMonth(calMonth), 'yyyy-MM-dd')
  const calMonthEnd   = format(endOfMonth(calMonth), 'yyyy-MM-dd')

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // 이번달 미완료 현금흐름 예정 (기존 — 이번달 고정)
  const { data: cashFlows = [] } = useQuery({
    queryKey: ['cash-flow-dashboard', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow_schedules')
        .select('id, flow_type, scheduled_date, amount, description, counterpart, is_completed, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('is_completed', false)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  // 달력용 쿼리 (calMonth 기준)
  const { data: calRevenues = [] } = useQuery({
    queryKey: ['fin-dash-cal-rev', profile.company_id, calMonthStart, calMonthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, description, is_completed, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'revenue')
        .gte('scheduled_date', calMonthStart)
        .lte('scheduled_date', calMonthEnd)
      return data || []
    },
  })
  const { data: calPayments = [] } = useQuery({
    queryKey: ['fin-dash-cal-pay', profile.company_id, calMonthStart, calMonthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, description, is_completed, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'payment')
        .gte('scheduled_date', calMonthStart)
        .lte('scheduled_date', calMonthEnd)
      return data || []
    },
  })
  const { data: calFixed = [] } = useQuery({
    queryKey: ['fin-dash-cal-fixed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount, billing_day')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return data || []
    },
    staleTime: 10 * 60 * 1000,
  })

  // 변동경비 이번달 실적
  const { data: varTx = [] } = useQuery({
    queryKey: ['fin-dash-var-tx', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('amount, description, transaction_date')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .eq('category', 'SGA')
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .not('description', 'like', '[정기]%')
        .order('transaction_date', { ascending: true })
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  // 수금예정: 이번달 중 오늘 이후(날짜 미경과)만 표시 — 날짜 경과분은 미수금에 표시
  const incoming = cashFlows.filter((f: any) => f.flow_type === 'revenue' && f.scheduled_date >= todayStr)
  const outgoing = cashFlows.filter((f: any) => f.flow_type === 'payment')
  const incomingTotal = incoming.reduce((s: number, f: any) => s + Number(f.amount), 0)
  const outgoingTotal = outgoing.reduce((s: number, f: any) => s + Number(f.amount), 0)

  // 미수금: flow_type=revenue, is_completed=false, scheduled_date < today (월 무관 전체)
  const { data: overdueRevenues = [] } = useQuery({
    queryKey: ['fin-dash-overdue-revenue', profile.company_id, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, supply_amount, description, counterpart, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'revenue')
        .eq('is_completed', false)
        .lt('scheduled_date', todayStr)
        .order('scheduled_date', { ascending: true })
      return data || []
    },
  })
  const overdueRevenueTotal = overdueRevenues.reduce((s: number, f: any) => s + Number(f.amount), 0)

  // 부가세 현황: 이번 분기 기준 (올해 1분기=1~3월, 2분기=4~6월, 3분기=7~9월, 4분기=10~12월)
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3)
  const qStart = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, '0')}-01`
  const qEndMonth = quarter * 3 + 3
  const qEnd = `${now.getFullYear()}-${String(qEndMonth).padStart(2, '0')}-${qEndMonth === 3 || qEndMonth === 12 ? '31' : qEndMonth === 6 ? '30' : qEndMonth === 9 ? '30' : '31'}`

  // ── 부가세 현황: transactions(원장)만 집계
  //   - 예정→완료 시 transactions에 자동 등록되므로 여기서 모두 포함됨
  //   - cash_flow_schedules는 별도 집계하지 않음 (중복 방지)

  // [1] 매출 부가세 - 원장 income + vat_type=issued
  const { data: vatRevTx = [] } = useQuery({
    queryKey: ['fin-vat-rev-tx', profile.company_id, qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, vat_amount, transaction_date')
        .eq('company_id', profile.company_id)
        .eq('type', 'income')
        .eq('vat_type', 'issued')
        .eq('is_voided', false)
        .gte('transaction_date', qStart)
        .lte('transaction_date', qEnd)
      return data || []
    },
  })

  // [2] 매입 부가세 - 원장 expense + vat_type=issued
  const { data: vatPayTx = [] } = useQuery({
    queryKey: ['fin-vat-pay-tx', profile.company_id, qStart, qEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, vat_amount, transaction_date')
        .eq('company_id', profile.company_id)
        .eq('type', 'expense')
        .eq('vat_type', 'issued')
        .eq('is_voided', false)
        .gte('transaction_date', qStart)
        .lte('transaction_date', qEnd)
      return data || []
    },
  })

  // 합산
  const vatRevenueTotal = vatRevTx.reduce((s: number, f: any) => s + Number(f.vat_amount || 0), 0)
  const vatPaymentTotal = vatPayTx.reduce((s: number, f: any) => s + Number(f.vat_amount || 0), 0)

  const vatRevCount = vatRevTx.length
  const vatPayCount = vatPayTx.length

  const vatNetAmount = vatRevenueTotal - vatPaymentTotal  // 납부 예상액
  const quarterLabel = `${now.getFullYear()}년 ${quarter + 1}분기`

  // 대시보드 고정판관비: 오버라이드 적용 (판관비 탭과 동일한 로직)
  const dashFixedItems = getEffectiveFixedItemsFPC(recurringBaseItems, recurringOverrides, currentMonthKey)
  const fixedTotal = dashFixedItems.reduce((s: number, i: any) => s + Number(i.amount), 0)
  const varTotal   = varTx.reduce((s: number, t: any) => s + Number(t.amount), 0)

  // summary.sga = transactions 테이블 SGA 카테고리 실적 (판관비 탭과 동일 데이터 소스)
  const s = summary  // DashboardTab은 summaryWithSga를 summary props로 받음
  const topCards = [
    {
      label: '매출',
      value: s?.revenue ?? 0,
      sign: '+',
      color: 'text-[#34C759]',
      bg: 'bg-[#34C759]/10',
      icon: <TrendingUp className="w-4 h-4 text-[#34C759]" />,
    },
    {
      label: '매출원가+현장경비',
      value: (s?.cogs ?? 0) + (s?.siteExpense ?? 0),
      sign: '-',
      color: 'text-[#FF3B30]',
      bg: 'bg-[#FF3B30]/10',
      icon: <TrendingDown className="w-4 h-4 text-[#FF3B30]" />,
    },
    {
      label: '매출총이익',
      value: s?.grossProfit ?? 0,
      sign: (s?.grossProfit ?? 0) >= 0 ? '+' : '',
      color: (s?.grossProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]',
      bg: (s?.grossProfit ?? 0) >= 0 ? 'bg-[#007AFF]/10' : 'bg-[#FF3B30]/10',
      icon: <TrendingUp className="w-4 h-4 text-[#007AFF]" />,
      rate: (s?.revenue ?? 0) > 0
        ? (((s?.grossProfit ?? 0) / (s?.revenue ?? 1)) * 100).toFixed(1) + '%'
        : null,
    },
    {
      label: '판관비',
      value: s?.sga ?? 0,
      sign: '-',
      color: 'text-[#FF9500]',
      bg: 'bg-[#FF9500]/10',
      icon: <Wallet className="w-4 h-4 text-[#FF9500]" />,
    },
  ]

  // 재무 대시보드용 달력 렌더러
  const FinDashCalendar = () => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const firstDow = firstDay.getDay()
    const totalCells = Math.ceil((firstDow + lastDay.getDate()) / 7) * 7
    const DAY_LABELS = ['일','월','화','수','목','금','토']
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const monthStr = format(calMonth, 'yyyy-MM')

    type CalEv = { type: 'revenue'|'payment'|'fixed'; amount: number; done?: boolean }
    const evMap: Record<string, CalEv[]> = {}
    const addEv = (d: string, ev: CalEv) => { if (!evMap[d]) evMap[d] = []; evMap[d].push(ev) }
    calRevenues.forEach((r: any) => addEv(r.scheduled_date, { type: 'revenue', amount: Number(r.amount), done: r.is_completed }))
    calPayments.forEach((p: any) => addEv(p.scheduled_date, { type: 'payment', amount: Number(p.amount), done: p.is_completed }))
    calFixed.forEach((fe: any) => {
      const day = Math.min(Number(fe.billing_day) || 25, lastDay.getDate())
      addEv(`${monthStr}-${String(day).padStart(2,'0')}`, { type: 'fixed', amount: Number(fe.amount) })
    })

    return (
      <div>
        <div className="grid grid-cols-7 border-b border-black/5">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={cn('text-center py-2.5 text-[11px] font-bold', i===0?'text-[#FF3B30]':i===6?'text-[#007AFF]':'text-[#8E8E93]')}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - firstDow + 1
            const isValid = dayNum >= 1 && dayNum <= lastDay.getDate()
            if (!isValid) return <div key={idx} className="border-b border-r border-black/4 min-h-[100px]" />
            const dateStr = `${monthStr}-${String(dayNum).padStart(2,'0')}`
            const isToday = dateStr === todayStr
            const dow = idx % 7
            const events = evMap[dateStr] || []
            return (
              <div key={idx} className={cn('border-b border-r border-black/4 min-h-[104px] p-1', idx%7===6&&'border-r-0', isToday&&'bg-[#007AFF]/5')}>
                <div className={cn('text-[12px] font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 mx-auto',
                  isToday?'bg-[#007AFF] text-white':dow===0?'text-[#FF3B30]':dow===6?'text-[#007AFF]':'text-[#1C1C1E]')}>{dayNum}</div>
                <div className="space-y-0.5">
                  {events.filter(e=>e.type==='revenue').map((e,ei)=>(
                    <div key={`r${ei}`} className={cn('rounded px-1 py-0.5 text-[11px] font-bold leading-tight',e.done?'bg-[#34C759]/10 text-[#34C759]/50':'bg-[#34C759]/15 text-[#34C759]')}>+{(e.amount/10000).toFixed(0)}만</div>
                  ))}
                  {events.filter(e=>e.type==='payment').map((e,ei)=>(
                    <div key={`p${ei}`} className={cn('rounded px-1 py-0.5 text-[11px] font-bold leading-tight',e.done?'bg-[#FF3B30]/10 text-[#FF3B30]/50':'bg-[#FF3B30]/15 text-[#FF3B30]')}>-{(e.amount/10000).toFixed(0)}만</div>
                  ))}
                  {events.filter(e=>e.type==='fixed').map((e,ei)=>(
                    <div key={`f${ei}`} className="rounded px-1 py-0.5 text-[11px] font-bold leading-tight bg-[#FF9500]/15 text-[#FF9500]">-{(e.amount/10000).toFixed(0)}만</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 현금흐름 섹션 (공통)
  const CashFlowSection = () => (
    <div className="space-y-3">
      <p className="text-[13px] font-semibold text-[#1C1C1E]">💰 이번달 현금흐름 예정</p>
      <div className="ios-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#34C759]/5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#34C759]">📥 수금예정</span>
            <span className="text-[11px] text-[#8E8E93]">{incoming.length}건</span>
          </div>
          <span className="text-[16px] font-bold text-[#34C759]">+{incomingTotal.toLocaleString()}원</span>
        </div>
        {incoming.length === 0 ? (
          <div className="px-4 py-3 text-center text-[13px] text-[#C7C7CC]">예정 없음</div>
        ) : incoming.map((f: any, i: number) => (
          <div key={f.id} className={cn('flex items-center gap-3 px-4 py-2.5', i < incoming.length - 1 && 'border-b border-black/5')}>
            {/* 날짜 */}
            <span className="text-[12px] font-semibold text-[#8E8E93] flex-shrink-0 w-10 text-center">{f.scheduled_date ? f.scheduled_date.slice(5).replace('-','/') : '-'}</span>
            {/* 내용 + 현장명 */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#1C1C1E] truncate">
                {f.description}{f.counterpart ? ` · ${f.counterpart}` : ''}
              </p>
              {f.projects?.name && (
                <p className="text-[11px] text-[#34C759] font-medium truncate">📍 {f.projects.name}</p>
              )}
            </div>
            <p className="text-[13px] font-bold text-[#34C759] flex-shrink-0">+{Number(f.amount).toLocaleString()}원</p>
          </div>
        ))}
      </div>
      {/* 미수금 카드 (날짜 지남 + 미완료 매출 · 월 무관) */}
      {overdueRevenues.length > 0 && (
        <div className="ios-card overflow-hidden border-2 border-[#FF3B30]/30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#FF3B30]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white">⚠️ 미수금</span>
              <span className="text-[11px] text-white/80">{overdueRevenues.length}건 · 날짜 경과</span>
            </div>
            <span className="text-[15px] font-bold text-white">+{overdueRevenueTotal.toLocaleString()}원</span>
          </div>
          {overdueRevenues.map((f: any, i: number) => (
            <div key={f.id} className={cn('flex items-center gap-3 px-4 py-2.5 bg-[#FFF5F5]', i < overdueRevenues.length - 1 && 'border-b border-[#FF3B30]/10')}>
              <div className="flex-shrink-0 text-center w-10">
                <p className="text-[10px] text-[#FF3B30]/60 font-medium leading-tight">{f.scheduled_date ? f.scheduled_date.slice(0,7).replace('-','/') : ''}</p>
                <p className="text-[12px] font-bold text-[#FF3B30]">{f.scheduled_date ? f.scheduled_date.slice(5).replace('-','/') : '-'}</p>
              </div>
              <p className="text-[13px] font-medium text-[#1C1C1E] truncate flex-1">
                {f.description}{f.projects?.name ? ` · ${f.projects.name}` : ''}
              </p>
              <p className="text-[13px] font-bold text-[#FF3B30] flex-shrink-0">+{Number(f.amount).toLocaleString()}원</p>
            </div>
          ))}
        </div>
      )}

      <div className="ios-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#FF3B30]/5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#FF3B30]">📤 결제예정</span>
            <span className="text-[11px] text-[#8E8E93]">{outgoing.length}건</span>
          </div>
          <span className="text-[16px] font-bold text-[#FF3B30]">-{outgoingTotal.toLocaleString()}원</span>
        </div>
        {outgoing.length === 0 ? (
          <div className="px-4 py-3 text-center text-[13px] text-[#C7C7CC]">예정 없음</div>
        ) : outgoing.map((f: any, i: number) => (
          <div key={f.id} className={cn('flex items-center gap-3 px-4 py-2.5', i < outgoing.length - 1 && 'border-b border-black/5')}>
            <span className="text-[12px] font-semibold text-[#8E8E93] flex-shrink-0 w-10 text-center">{f.scheduled_date ? f.scheduled_date.slice(5).replace('-','/') : '-'}</span>
            <p className="text-[13px] font-medium text-[#1C1C1E] truncate flex-1">
              {f.description}{f.counterpart ? ` · ${f.counterpart}` : ''}
            </p>
            <p className="text-[13px] font-bold text-[#FF3B30] flex-shrink-0">-{Number(f.amount).toLocaleString()}원</p>
          </div>
        ))}
      </div>
      {/* 고정판관비 — 항상 표시 */}
      <div className="ios-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#FF9500]/5">
          <span className="text-[13px] font-bold text-[#FF9500]">🏢 고정 판관비</span>
          <span className="text-[14px] font-bold text-[#FF9500]">{fixedTotal.toLocaleString()}원/월</span>
        </div>
        {dashFixedItems.length === 0 ? (
          <div className="px-4 py-3 text-center text-[13px] text-[#C7C7CC]">항목 없음</div>
        ) : dashFixedItems.map((fe: any, i: number) => (
          <div key={fe.id} className={cn('flex items-center gap-3 px-4 py-2.5', i < dashFixedItems.length - 1 && 'border-b border-black/5')}>
            <span className="text-[12px] font-semibold text-[#8E8E93] flex-shrink-0 w-10 text-center">
              {fe.billing_day ? `${fe.billing_day}일` : '-'}
            </span>
            <span className="text-[13px] text-[#3C3C43] truncate flex-1">{fe.name}</span>
            <span className="text-[13px] font-semibold text-[#FF9500]">{Number(fe.amount).toLocaleString()}원</span>
          </div>
        ))}
      </div>
      {/* 변동경비 — 항상 표시 */}
      <div className="ios-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-[#5856D6]/5">
          <span className="text-[13px] font-bold text-[#5856D6]">📋 변동 경비</span>
          <span className="text-[14px] font-bold text-[#5856D6]">{varTotal.toLocaleString()}원</span>
        </div>
        {varTx.length === 0 ? (
          <div className="px-4 py-3 text-center text-[13px] text-[#C7C7CC]">이번달 변동경비 없음</div>
        ) : varTx.map((tx: any, i: number) => (
          <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5', i < varTx.length - 1 && 'border-b border-black/5')}>
            <span className="text-[12px] font-semibold text-[#8E8E93] flex-shrink-0 w-10 text-center">
              {tx.transaction_date ? tx.transaction_date.slice(5).replace('-','/') : '-'}
            </span>
            <span className="text-[13px] text-[#3C3C43] truncate flex-1">{tx.description || '변동경비'}</span>
            <span className="text-[13px] font-semibold text-[#5856D6]">-{Number(tx.amount).toLocaleString()}원</span>
          </div>
        ))}
      </div>

      {/* ── 부가세 현황 카드 ── */}
      <div className="ios-card overflow-hidden">
        <div className="px-4 py-3 border-b border-black/5 bg-[#FF9500]/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#FF9500]">🧾 부가세 현황</span>
              <span className="text-[11px] text-[#8E8E93]">{quarterLabel} · 수금완료 기준</span>
            </div>
            <span className={cn(
              'text-[14px] font-bold',
              vatNetAmount > 0 ? 'text-[#FF3B30]' : 'text-[#34C759]'
            )}>
              {vatNetAmount > 0 ? `납부 ${vatNetAmount.toLocaleString()}원` : vatNetAmount < 0 ? `환급 ${Math.abs(vatNetAmount).toLocaleString()}원` : '0원'}
            </span>
          </div>
        </div>
        {/* 매출 부가세 행 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#34C759] flex-shrink-0" />
            <span className="text-[13px] text-[#3C3C43]">매출 부가세 (받은 것)</span>
            <span className="text-[11px] text-[#8E8E93]">{vatRevCount}건</span>
          </div>
          <span className="text-[13px] font-semibold text-[#34C759]">+{vatRevenueTotal.toLocaleString()}원</span>
        </div>
        {/* 매입 부가세 행 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#007AFF] flex-shrink-0" />
            <span className="text-[13px] text-[#3C3C43]">매입 부가세 (낸 것)</span>
            <span className="text-[11px] text-[#8E8E93]">{vatPayCount}건</span>
          </div>
          <span className="text-[13px] font-semibold text-[#007AFF]">-{vatPaymentTotal.toLocaleString()}원</span>
        </div>
        {/* 안내 문구 */}
        <div className="px-4 py-2.5 bg-[#FF9500]/5">
          <p className="text-[11px] text-[#FF9500]">
            {vatNetAmount > 0
              ? `⚠️ ${quarterLabel} 부가세 신고 시 ${vatNetAmount.toLocaleString()}원 납부 예정 (보관 필요)`
              : vatNetAmount < 0
              ? `✅ 매입이 더 많아 ${Math.abs(vatNetAmount).toLocaleString()}원 환급 예상`
              : '부가세 발행 수금/결제 내역이 없습니다'}
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-4">
      {/* 이번달 세전이익 요약 카드 */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: (s?.netProfit ?? 0) >= 0 ? '#007AFF' : '#FF3B30', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <p className="text-white/80 text-[13px] font-medium">이번달 세전이익</p>
        <div className="flex items-baseline gap-2 mt-1">
          <p className="text-white text-[32px] font-bold">
            {(s?.netProfit ?? 0).toLocaleString()}
            <span className="text-[16px] font-normal ml-1">원</span>
          </p>
          {(s?.revenue ?? 0) > 0 && (
            <span className="text-white/80 text-[15px] font-semibold">
              {(((s?.netProfit ?? 0) / (s?.revenue ?? 1)) * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* 월별 4개 지표 — 모바일 2열 / PC 4열 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {topCards.map((card: any) => (
          <div key={card.label} className="ios-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', card.bg)}>
                {card.icon}
              </div>
              <span className="text-[12px] text-[#8E8E93]">{card.label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className={cn('text-[18px] font-bold', card.color)}>
                {card.sign}{card.value.toLocaleString()}
                <span className="text-[12px] font-normal ml-0.5">원</span>
              </p>
              {(card as any).rate && (
                <span className={cn('text-[11px] font-semibold', card.color)}>{(card as any).rate}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 모바일: 현금흐름 → 달력 순 세로 배치 */}
      <div className="md:hidden space-y-4">
        <CashFlowSection />
        {/* 달력 */}
        <div className="ios-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
            <button onClick={() => setCalMonth(p => addMonths(p, -1))} className="text-[#007AFF] text-[13px] font-semibold px-2">‹ 이전</button>
            <p className="text-[13px] font-bold text-black">{format(calMonth, 'yyyy년 M월', { locale: ko })}</p>
            <button onClick={() => setCalMonth(p => addMonths(p, 1))} className="text-[#007AFF] text-[13px] font-semibold px-2">다음 ›</button>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 border-b border-black/5 flex-wrap">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#34C759]" /><span className="text-[10px]">매출예정</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF3B30]" /><span className="text-[10px]">결제예정</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF9500]" /><span className="text-[10px]">고정판관비</span></div>
          </div>
          <FinDashCalendar />
        </div>
      </div>

      {/* PC: 좌=현금흐름+판관비, 우=달력 2분할 */}
      <div className="hidden md:grid md:grid-cols-2 gap-5 items-start">
        <div className="space-y-4">
          <CashFlowSection />
        </div>
        <div className="ios-card overflow-hidden sticky top-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
            <button onClick={() => setCalMonth(p => addMonths(p, -1))} className="text-[#007AFF] text-[13px] font-semibold px-2 active:opacity-60">‹ 이전</button>
            <p className="text-[14px] font-bold text-black">{format(calMonth, 'yyyy년 M월', { locale: ko })} 자금흐름</p>
            <button onClick={() => setCalMonth(p => addMonths(p, 1))} className="text-[#007AFF] text-[13px] font-semibold px-2 active:opacity-60">다음 ›</button>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 border-b border-black/5 flex-wrap">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#34C759]" /><span className="text-[10px] text-[#3C3C43]">매출예정</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF3B30]" /><span className="text-[10px] text-[#3C3C43]">결제예정</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF9500]" /><span className="text-[10px] text-[#3C3C43]">고정판관비</span></div>
          </div>
          <FinDashCalendar />
        </div>
      </div>
    </div>
  )
}

// ─── 원장 ───────────────────────────────────
function LedgerTab({
  profile, selectedProjectId, monthStart, monthEnd, currentMonth
}: {
  profile: any
  selectedProjectId: string
  monthStart: string
  monthEnd: string
  currentMonth: Date
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [editTx, setEditTx] = useState<any | null>(null)   // 수정 대상 원장

  // ── 원장 수정 mutation
  const updateTxMutation = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase
        .from('transactions')
        .update(patch)
        .eq('id', patch.id)
        .eq('company_id', profile.company_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['project-pl'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['variable-tx'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['sga-summary'], exact: false })
      toast.success('수정됐습니다')
      setEditTx(null)
    },
    onError: (e: any) => toast.error(e.message || '수정에 실패했습니다'),
  })

  // ── 원장 삭제(void) mutation
  const voidTxMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({ is_voided: true })
        .eq('id', id)
        .eq('company_id', profile.company_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['variable-tx'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['sga-summary'], exact: false })
      toast.success('삭제됐습니다')
      setEditTx(null)
    },
    onError: (e: any) => toast.error(e.message || '삭제에 실패했습니다'),
  })

  const CATEGORY_LABELS: Record<string, string> = {
    REVENUE: '매출', COGS: '원가', SGA: '판관비', NON_OPERATING: '영업외', TAX: '세금', SITE_EXPENSE: '현장경비',
  }
  const CATEGORY_COLOR: Record<string, string> = {
    REVENUE: 'bg-[#34C759]/15 text-[#34C759]',
    COGS: 'bg-[#FF3B30]/15 text-[#FF3B30]',
    SGA: 'bg-[#FF9500]/15 text-[#FF9500]',
    NON_OPERATING: 'bg-[#8E8E93]/15 text-[#8E8E93]',
    TAX: 'bg-[#FF2D55]/15 text-[#FF2D55]',
    SITE_EXPENSE: 'bg-[#5AC8FA]/15 text-[#5AC8FA]',
  }

  // 월 변경 시 limit 초기화
  const monthKey = `${monthStart}-${monthEnd}`
  const prevMonthKey = useState(monthKey)[0]

  // 원장 쿼리 - 월별 필터 + 현장 필터
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['ledger-transactions', profile.company_id, selectedProjectId, monthStart, monthEnd],
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select(`
          id, type, category, sub_category, amount, supply_amount, vat_amount, vat_type,
          description, transaction_date, is_voided, is_internal_transfer,
          has_vat, payment_method, memo, created_by, cash_account_id,
          project:projects(id, name)
        `)
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (selectedProjectId) q = q.eq('project_id', selectedProjectId)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // 월별 수입/지출 합계 (필터 무관 전체 기준)
  const monthIncome  = transactions.filter((t: any) => t.type === 'income'  && !t.is_internal_transfer).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthExpense = transactions.filter((t: any) => t.type === 'expense' && !t.is_internal_transfer).reduce((s: number, t: any) => s + Number(t.amount), 0)
  // 카테고리별 집계
  const monthRevenue = transactions.filter((t: any) => t.category === 'REVENUE').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthCogs    = transactions.filter((t: any) => t.category === 'COGS').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthSga     = transactions.filter((t: any) => t.category === 'SGA' && !t.is_internal_transfer).reduce((s: number, t: any) => s + Number(t.amount), 0)

  // 필터 적용 목록
  const filteredTransactions = ledgerFilter === 'all'
    ? transactions
    : ledgerFilter === 'income'
      ? transactions.filter((t: any) => t.type === 'income')
      : transactions.filter((t: any) => t.type === 'expense')

  // PC 현장별 그룹핑
  type TxGroup = { projectId: string | null; projectName: string; txs: any[] }
  const projectGroupMap = new Map<string, TxGroup>()
  for (const tx of filteredTransactions) {
    const key = tx.project?.id ?? '__none__'
    if (!projectGroupMap.has(key)) {
      projectGroupMap.set(key, {
        projectId: tx.project?.id ?? null,
        projectName: tx.project?.name ?? '현장 미지정',
        txs: [],
      })
    }
    projectGroupMap.get(key)!.txs.push(tx)
  }
  const projectGroups = Array.from(projectGroupMap.values()).sort((a, b) => {
    if (a.projectId === null) return 1
    if (b.projectId === null) return -1
    return a.projectName.localeCompare(b.projectName, 'ko')
  })

  // 거래 단일 행 렌더러 (모바일·PC 공용)
  function TxRow({ tx }: { tx: any }) {
    return (
      <div
        className={cn('p-4 active:bg-black/5 cursor-pointer transition-colors', tx.is_voided && 'opacity-40')}
        onClick={() => !tx.is_voided && setEditTx(tx)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={cn(
                'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                CATEGORY_COLOR[tx.category] ?? 'bg-gray-100 text-[#8E8E93]'
              )}>
                {tx.category === 'SGA' && tx.sub_category
                  ? tx.sub_category
                  : CATEGORY_LABELS[tx.category] ?? tx.category}
              </span>
              {tx.is_internal_transfer && (
                <span className="text-[11px] bg-[#FF9500]/10 text-[#FF9500] px-2 py-0.5 rounded-full">
                  내부이동
                </span>
              )}
              {tx.has_vat && (
                <span className="text-[11px] bg-[#5856D6]/10 text-[#5856D6] px-2 py-0.5 rounded-full">
                  세금계산서
                </span>
              )}
              {tx.is_voided && (
                <span className="text-[11px] bg-[#FF3B30]/10 text-[#FF3B30] px-2 py-0.5 rounded-full">
                  삭제됨
                </span>
              )}
            </div>
            <p className="text-[14px] font-medium text-black truncate">
              {(tx.description || '').replace(/\s*\(계산서발행\)|\s*\(계산서미발행\)/g, '')}
            </p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">
              {format(new Date(tx.transaction_date), 'M/d (E)', { locale: ko })}
              {tx.payment_method === 'cash' && ' · 시재'}
              {tx.payment_method === 'transfer' && ' · 계좌이체'}
              {tx.payment_method === 'card' && ' · 카드'}
              {(() => {
                const vatAmt = Number(tx.vat_amount || 0)
                const isIssued = tx.vat_type === 'issued' || (!tx.vat_type && tx.has_vat)
                if (!isIssued) return null
                // vat_amount가 0으로 잘못 저장된 경우 공급가의 10%로 추정 표시
                const display = vatAmt > 0 ? vatAmt : Math.round(Number(tx.supply_amount || tx.amount || 0) * 0.1)
                return display > 0 ? ` · 부가세 ${display.toLocaleString()}원` : null
              })()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className={cn(
              'text-[15px] font-bold',
              tx.type === 'income' ? 'text-[#34C759]' : 'text-[#FF3B30]'
            )}>
              {tx.type === 'income' ? '+' : '-'}{Number(tx.amount).toLocaleString()}원
            </p>
            <span className="text-[#C7C7CC] text-[12px]">›</span>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="ios-card p-8 text-center">
          <p className="text-[14px] text-[#8E8E93]">불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* 월 요약 카드 — 탭 역할 겸용 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setLedgerFilter(ledgerFilter === 'income' ? 'all' : 'income')}
          className={cn(
            'p-3 text-center rounded-xl transition-all',
            ledgerFilter === 'income' ? 'shadow-sm' : 'ios-card'
          )}
          style={ledgerFilter === 'income' ? { background: '#34C759', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' } : {}}
        >
          <p className={cn('text-[11px] mb-1', ledgerFilter === 'income' ? 'text-white/80' : 'text-[#8E8E93]')}>매출</p>
          <p className={cn('text-[13px] font-bold', ledgerFilter === 'income' ? 'text-white' : 'text-[#34C759]')}>
            +{monthIncome.toLocaleString()}
          </p>
        </button>
        <button
          onClick={() => setLedgerFilter('all')}
          className="rounded-xl p-3 text-center transition-all"
          style={{
            background: ledgerFilter === 'all'
              ? ((monthRevenue - monthCogs) >= 0 ? '#007AFF' : '#FF3B30')
              : '#E5E5EA',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
          }}
        >
          <p className={cn('text-[11px] mb-1', ledgerFilter === 'all' ? 'text-white/80' : 'text-[#8E8E93]')}>매출이익</p>
          <p className={cn('text-[13px] font-bold', ledgerFilter === 'all' ? 'text-white' : ((monthRevenue - monthCogs) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'))}>
            {(monthRevenue - monthCogs) >= 0 ? '+' : ''}{(monthRevenue - monthCogs).toLocaleString()}
          </p>
        </button>
        <button
          onClick={() => setLedgerFilter(ledgerFilter === 'expense' ? 'all' : 'expense')}
          className={cn(
            'p-3 text-center rounded-xl transition-all',
            ledgerFilter === 'expense' ? 'shadow-sm' : 'ios-card'
          )}
          style={ledgerFilter === 'expense' ? { background: '#FF3B30', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' } : {}}
        >
          <p className={cn('text-[11px] mb-1', ledgerFilter === 'expense' ? 'text-white/80' : 'text-[#8E8E93]')}>원가</p>
          <p className={cn('text-[13px] font-bold', ledgerFilter === 'expense' ? 'text-white' : 'text-[#FF3B30]')}>
            -{monthExpense.toLocaleString()}
          </p>
        </button>
      </div>

      {/* 건수 */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#8E8E93]">
          {format(currentMonth, 'M월', { locale: ko })}{' '}
          {ledgerFilter === 'income' ? '매출' : ledgerFilter === 'expense' ? '지출' : '전체'}{' '}
          <span className="font-semibold text-black">{filteredTransactions.length}</span>건
        </p>
        {selectedProjectId && (
          <span className="text-[12px] bg-[#007AFF]/10 text-[#007AFF] px-2.5 py-1 rounded-full font-medium">
            현장 필터
          </span>
        )}
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="ios-card p-8 text-center">
          <p className="text-[32px] mb-2">📒</p>
          <p className="text-[14px] text-[#8E8E93] mb-1">
            {format(currentMonth, 'M월', { locale: ko })} 거래내역이 없습니다
          </p>
          <p className="text-[12px] text-[#C7C7CC]">우측 상단 + 버튼으로 거래를 등록하세요</p>
        </div>
      ) : (
        <>
          {/* 모바일: 단순 리스트 / PC: 현장별 3열 그리드 */}
          <div className="md:hidden ios-card divide-y divide-black/5 overflow-hidden">
            {filteredTransactions.map((tx: any) => <TxRow key={tx.id} tx={tx} />)}
          </div>
          <div className="hidden md:grid md:grid-cols-3 gap-4 items-start">
            {projectGroups.map((group, groupIdx) => {
              const grpIncome = group.txs.filter((t) => t.type === 'income' && !t.is_internal_transfer).reduce((s, t) => s + Number(t.amount), 0)
              const grpExpense = group.txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
              return (
                <div key={group.projectId ?? '__none__'} className="ios-card overflow-hidden">
                  {/* 현장 헤더 — 그레이 단일색 */}
                  <div className="px-4 py-3 border-b border-black/5 bg-[#636366]">
                    <p className="text-[13px] font-semibold truncate text-white">{group.projectName}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[11px] font-medium text-white/80">+{grpIncome.toLocaleString()}</span>
                      <span className="text-[11px] font-medium text-white/80">-{grpExpense.toLocaleString()}</span>
                    </div>
                  </div>
                  {/* 거래 목록 */}
                  <div className="divide-y divide-black/5">
                    {group.txs.map((tx: any) => <TxRow key={tx.id} tx={tx} />)}
                  </div>
                </div>
              )
            })}
          </div>

        </>
      )}

      {/* ── 원장 수정 Sheet ── */}
      {editTx && (
        <EditTransactionSheet
          tx={editTx}
          profile={profile}
          onClose={() => setEditTx(null)}
          onSave={(patch) => updateTxMutation.mutate({ ...patch, id: editTx.id })}
          onVoid={() => voidTxMutation.mutate(editTx.id)}
          isSaving={updateTxMutation.isPending}
          isVoiding={voidTxMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── 원장 수정 Sheet ─────────────────────────
// 수입/지출별 선택 가능 카테고리
const EDIT_INCOME_CATEGORIES = ['REVENUE', 'NON_OPERATING'] as const
const EDIT_EXPENSE_CATEGORIES = ['COGS', 'SITE_EXPENSE', 'SGA', 'TAX'] as const

function EditTransactionSheet({
  tx, profile, onClose, onSave, onVoid, isSaving, isVoiding,
}: {
  tx: any
  profile: any
  onClose: () => void
  onSave: (patch: any) => void
  onVoid: () => void
  isSaving: boolean
  isVoiding: boolean
}) {
  const supabase = createClient()
  const [supplyAmount, setSupplyAmount] = useState(String(Math.round(Number(tx.supply_amount || tx.amount || 0))))
  const [vatType, setVatType] = useState<'issued' | 'not_issued'>(tx.vat_type || (tx.has_vat ? 'issued' : 'not_issued'))
  // vat_amount가 0이고 vatType=issued면 공급가의 10%로 자동 보정
  const [vatAmount, setVatAmount] = useState(() => {
    const savedVat = Math.round(Number(tx.vat_amount || 0))
    if (savedVat > 0) return String(savedVat)
    const isIssued = tx.vat_type === 'issued' || (!tx.vat_type && tx.has_vat)
    if (isIssued) {
      const supply = Math.round(Number(tx.supply_amount || tx.amount || 0))
      return String(Math.round(supply * 0.1))
    }
    return '0'
  })
  const [description, setDescription] = useState(
    (tx.description || '').replace(/\s*\(계산서발행\)|\s*\(계산서미발행\)/g, '')
  )
  const [memo, setMemo] = useState(tx.memo || '')
  const [txDate, setTxDate] = useState(tx.transaction_date || format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState(tx.payment_method || 'transfer')
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)

  // ── 분류 / 세부분류 ──
  const [category, setCategory] = useState<string>(tx.category || (tx.type === 'income' ? 'REVENUE' : 'COGS'))
  const [subCategory, setSubCategory] = useState<string>(tx.sub_category || '')

  const isInternalTransfer = tx.is_internal_transfer === true
  const editCategories = tx.type === 'income' ? EDIT_INCOME_CATEGORIES : EDIT_EXPENSE_CATEGORIES
  const subCategories: string[] = (TRANSACTION_SUB_CATEGORIES as any)[category] || []

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name')
        .eq('company_id', profile.company_id).eq('status', 'active').order('name')
      return data || []
    },
  })

  const formatNum = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  const handleSupplyChange = (v: string) => {
    const num = v.replace(/\D/g, '')
    setSupplyAmount(num ? parseInt(num).toLocaleString() : '')
    if (vatType === 'issued' && num) {
      setVatAmount(Math.round(parseInt(num) * 0.1).toLocaleString())
    }
  }

  const handleVatTypeChange = (issued: boolean) => {
    setVatType(issued ? 'issued' : 'not_issued')
    if (issued && supplyAmount) {
      const supply = parseInt(supplyAmount.replace(/,/g, '')) || 0
      setVatAmount(Math.round(supply * 0.1).toLocaleString())
    } else {
      setVatAmount('0')
    }
  }

  const supply = parseInt(supplyAmount.replace(/,/g, '')) || 0
  const vat = vatType === 'issued' ? (parseInt(vatAmount.replace(/,/g, '')) || 0) : 0
  const amountColor = tx.type === 'income' ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'

  const handleSave = () => {
    if (!supply || supply <= 0) { toast.error('공급가를 입력해주세요'); return }
    if (!description.trim()) { toast.error('적요를 입력해주세요'); return }
    onSave({
      supply_amount:  supply,
      vat_amount:     vat,
      vat_type:       vatType,
      amount:         supply,           // 원장 = 공급가만
      has_vat:        vatType === 'issued',
      description:    description.trim(),
      memo:           memo.trim() || null,
      transaction_date: txDate,
      payment_method: paymentMethod,
      // 분류 (시재이동은 변경 불가)
      ...(!isInternalTransfer && {
        category:     category,
        sub_category: subCategory || null,
      }),
    })
  }

  return (
    <Sheet open={true} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">원장 수정</SheetTitle>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {isSaving ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* 유형 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'px-3 py-1.5 rounded-xl text-[13px] font-bold',
              tx.type === 'income' ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'
            )}>
              {tx.type === 'income' ? '💰 수입' : '💸 지출'}
              {isInternalTransfer && ' (시재이동)'}
            </span>
          </div>

          {/* ── 분류 선택 (시재이동 제외) ── */}
          {!isInternalTransfer && (
            <div className="space-y-2.5">
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">분류</label>
                <div className="flex gap-2 flex-wrap">
                  {editCategories.map((cat) => (
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

              {/* 세부분류 */}
              {subCategories.length > 0 && (
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">세부 분류</label>
                  <div className="flex gap-2 flex-wrap">
                    {subCategories.map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setSubCategory(subCategory === sub ? '' : sub)}
                        className={cn(
                          'px-3 py-2 rounded-xl text-[13px] font-medium border-2 transition-all',
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
            </div>
          )}

          {/* 분류 표시 (시재이동인 경우 읽기 전용) */}
          {isInternalTransfer && (
            <div className="px-4 py-2.5 bg-[#FF9500]/10 rounded-xl">
              <p className="text-[12px] text-[#FF9500] font-medium">
                🏦 시재이동 — 분류 변경 불가 (내부 자금 이동)
              </p>
            </div>
          )}

          {/* 공급가 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">공급가 *</label>
            <div className="relative">
              <input
                type="text" inputMode="numeric"
                value={supplyAmount}
                onChange={(e) => handleSupplyChange(e.target.value)}
                placeholder="0"
                className={cn('w-full px-4 py-4 rounded-xl text-[24px] font-bold placeholder:text-[#C7C7CC] outline-none pr-10', amountColor)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
            </div>
          </div>

          {/* 부가세 체크박스 */}
          <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer select-none">
            <div
              onClick={() => handleVatTypeChange(vatType !== 'issued')}
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0',
                vatType === 'issued' ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white border-[#C7C7CC]'
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

          {/* 부가세 금액 */}
          {vatType === 'issued' && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">부가세</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(formatNum(e.target.value))}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[18px] font-bold text-[#007AFF] placeholder:text-[#C7C7CC] outline-none pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
              </div>
            </div>
          )}

          {/* 합계 요약 */}
          {supply > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-[#F2F2F7]">
                <span className="text-[13px] text-[#8E8E93]">원장 등록 금액 (공급가)</span>
                <span className="text-[15px] font-bold text-[#3C3C43]">{supply.toLocaleString()}원</span>
              </div>
              {vatType === 'issued' && (
                <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-[#007AFF]/8">
                  <span className="text-[13px] text-[#007AFF]">실제 수취/지급 총액</span>
                  <span className="text-[15px] font-bold text-[#007AFF]">{(supply + vat).toLocaleString()}원</span>
                </div>
              )}
            </div>
          )}

          {/* 적요 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">적요 *</label>
            <input
              type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="적요 입력"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 날짜 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">날짜</label>
            <input
              type="date" value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
            />
          </div>

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

          {/* 메모 */}
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

          {/* 삭제 */}
          <div>
            {!showVoidConfirm ? (
              <button
                onClick={() => setShowVoidConfirm(true)}
                className="w-full py-3 rounded-xl border border-[#FF3B30]/30 text-[#FF3B30] text-[14px] font-medium"
              >
                이 거래 삭제
              </button>
            ) : (
              <div className="rounded-xl bg-[#FF3B30]/5 border border-[#FF3B30]/20 p-4 space-y-3">
                <p className="text-[14px] text-[#FF3B30] font-medium text-center">정말 삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowVoidConfirm(false)}
                    className="flex-1 py-2.5 bg-white text-[#8E8E93] text-[14px] rounded-xl border border-black/10"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => onVoid()}
                    disabled={isVoiding}
                    className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[14px] font-semibold rounded-xl disabled:opacity-40"
                  >
                    {isVoiding ? '삭제중...' : '삭제'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── 시재 계좌 추가 Sheet ────────────────────
function AddCashAccountSheet({
  open,
  onClose,
  onSuccess,
  profile,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profile: any
}) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [initialBalance, setInitialBalance] = useState('')

  // 회사 멤버 목록 조회
  const { data: members = [] } = useQuery({
    queryKey: ['company-members', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name')
      return data || []
    },
    enabled: open,
  })

  const [selectedUserId, setSelectedUserId] = useState('')

  const addAccount = useMutation({
    mutationFn: async () => {
      const userId = selectedUserId || profile.id
      const balance = parseInt(initialBalance.replace(/,/g, '') || '0')

      // 기존 계좌 전체 조회 (is_active 무관)
      const { data: anyExisting, error: checkError } = await supabase
        .from('cash_accounts')
        .select('id, is_active')
        .eq('company_id', profile.company_id)
        .eq('user_id', userId)
        .maybeSingle()

      if (checkError) {
        throw new Error(`조회 실패: ${checkError.message} (${checkError.code})`)
      }

      if (anyExisting?.is_active === true) {
        throw new Error('해당 멤버의 시재 계좌가 이미 존재합니다')
      }

      if (anyExisting) {
        // 기존 계좌 재활성화 + 잔액 업데이트
        const { error } = await supabase
          .from('cash_accounts')
          .update({
            name: name.trim() || '시재',
            initial_balance: balance,
            current_balance: balance,
            is_active: true,
          })
          .eq('id', anyExisting.id)
        if (error) throw new Error(`재활성화 실패: ${error.message} (${error.code})`)
      } else {
        // 신규 계좌 생성
        const { error } = await supabase.from('cash_accounts').insert({
          company_id: profile.company_id,
          user_id: userId,
          name: name.trim() || '시재',
          initial_balance: balance,
          current_balance: balance,
          is_active: true,
        })
        if (error) throw new Error(`등록 실패: ${error.message} (${error.code})`)
      }
    },
    onSuccess: () => {
      toast.success('시재 계좌가 등록되었습니다')
      handleClose()
      onSuccess()
    },
    onError: (e: any) => toast.error(e.message || '등록에 실패했습니다'),
  })

  const handleClose = () => {
    setName('')
    setInitialBalance('')
    setSelectedUserId('')
    onClose()
  }

  const formatBalance = (v: string) => {
    const num = v.replace(/\D/g, '')
    return num ? parseInt(num).toLocaleString() : ''
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ maxHeight: '80dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">시재 계좌 추가</SheetTitle>
            <button
              onClick={() => addAccount.mutate()}
              disabled={addAccount.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {addAccount.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {/* 담당자 선택 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">담당자 *</label>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={cn(
                  'w-full px-4 py-3 rounded-xl text-[15px] outline-none appearance-none font-medium',
                  selectedUserId
                    ? 'bg-[#007AFF]/10 text-[#007AFF]'
                    : 'bg-[#F2F2F7] text-[#8E8E93]'
                )}
              >
                <option value="">담당자 선택 (미선택 시 본인)</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none">▼</span>
            </div>
          </div>

          {/* 계좌명 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">계좌명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 현장 시재 (미입력 시 '시재')"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 초기 잔액 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">초기 잔액</label>
            <div className="relative">
              <input
                type="text"
                value={initialBalance}
                onChange={(e) => setInitialBalance(formatBalance(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-4 bg-[#34C759]/10 rounded-xl text-[22px] font-bold text-[#34C759] placeholder:text-[#C7C7CC] outline-none pr-10"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93] font-medium">원</span>
            </div>
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── 시재 개인 카드 ──────────────────────────
function CashPersonCard({
  acc, profile, isOwner, onEntry, onDetail
}: {
  acc: any; profile: any; isOwner: boolean
  onEntry: (acc: any) => void; onDetail: (acc: any) => void
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isMe = acc.user_id === profile.id
  const today = format(new Date(), 'yyyy-MM-dd')

  // 잔액 직접 수정 상태
  const [editingBalance, setEditingBalance] = useState(false)
  const [editVal, setEditVal] = useState('')

  // PC 상세 아코디언 상태
  const [pcOpen, setPcOpen] = useState(false)
  const [detailExpanded, setDetailExpanded] = useState(false)

  // 인라인 거래 수정 상태 (PC 전용)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editHasVat, setEditHasVat] = useState(false)

  const PREVIEW = 5  // 기본 표시 건수

  // 거래내역 (PC 아코디언 열릴 때 전체, 기본은 최근 5건)
  const { data: txList = [], refetch: refetchTx } = useQuery({
    queryKey: ['cash-tx-card', acc.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, type, category, amount, description, transaction_date, is_internal_transfer, has_vat, is_voided, is_modified, project:projects(id, name)')
        .eq('cash_account_id', acc.id)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
      return data || []
    },
    staleTime: 0,
  })

  const previewList  = txList.slice(0, PREVIEW)
  const hasMoreTx    = txList.length > PREVIEW

  // 잔액 수정 mutation
  const updateBalance = useMutation({
    mutationFn: async (balance: number) => {
      const { error } = await supabase
        .from('cash_accounts')
        .update({ current_balance: balance })
        .eq('id', acc.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-accounts', profile.company_id] })
      toast.success('잔액이 수정되었습니다')
      setEditingBalance(false)
    },
    onError: (e: any) => toast.error(e.message),
  })

  // 시재 전체 초기화: 거래내역 전부 삭제 + 잔액 0원
  const resetAccount = useMutation({
    mutationFn: async () => {
      // 1) 해당 시재 계좌 거래내역 전부 is_voided = true (소프트 삭제 - RLS 안전)
      const { error: delError } = await supabase
        .from('transactions')
        .update({ is_voided: true })
        .eq('cash_account_id', acc.id)
        .eq('company_id', profile.company_id)
      if (delError) throw new Error(`거래내역 삭제 실패: ${delError.message}`)
      // 2) 잔액 0원으로 리셋
      const { error: balError } = await supabase
        .from('cash_accounts')
        .update({ current_balance: 0 })
        .eq('id', acc.id)
      if (balError) throw new Error(`잔액 초기화 실패: ${balError.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-accounts', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['cash-tx-card', acc.id] })
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'], exact: false })
      toast.success('시재가 초기화됐습니다')
    },
    onError: (e: any) => toast.error(e.message || '초기화에 실패했습니다'),
  })

  // 거래 수정 mutation (PC 인라인)
  const updateTx = useMutation({
    mutationFn: async (txId: string) => {
      const numAmount = parseInt(editAmount.replace(/,/g, ''))
      if (!numAmount || numAmount <= 0) throw new Error('금액을 입력해주세요')
      if (!editDescription.trim()) throw new Error('내용을 입력해주세요')
      const { error } = await supabase
        .from('transactions')
        .update({ amount: numAmount, description: editDescription.trim(), has_vat: editHasVat, is_modified: true })
        .eq('id', txId)
      if (error) throw new Error(`수정 실패: ${error.message}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-tx-card', acc.id] })
      queryClient.invalidateQueries({ queryKey: ['cash-accounts', profile.company_id] })
      toast.success('수정되었습니다')
      setEditingTxId(null)
    },
    onError: (e: any) => toast.error(e.message),
  })

  const startTxEdit = (tx: any) => {
    setEditingTxId(tx.id)
    setEditAmount(Number(tx.amount).toLocaleString())
    setEditDescription(tx.description)
    setEditHasVat(tx.has_vat ?? false)
  }

  const fmtNum = (v: string) => {
    const n = v.replace(/\D/g, '')
    return n ? parseInt(n).toLocaleString() : ''
  }

  // 카테고리 뱃지 스타일/라벨
  const CAT_BADGE: Record<string, { label: string; cls: string }> = {
    COGS:         { label: '매출원가', cls: 'bg-[#FF3B30]/12 text-[#FF3B30]' },
    SITE_EXPENSE: { label: '현장경비', cls: 'bg-[#FF9500]/12 text-[#FF9500]' },
    SGA:          { label: '판관비',   cls: 'bg-[#007AFF]/12 text-[#007AFF]' },
    TAX:          { label: '세금',     cls: 'bg-[#FF2D55]/12 text-[#FF2D55]' },
    NON_OPERATING:{ label: '입금',     cls: 'bg-[#34C759]/12 text-[#34C759]' },
  }

  // 공통: 거래 1행 컴포넌트
  const TxRow = ({ tx, showEdit }: { tx: any; showEdit?: boolean }) => {
    const isIncome  = tx.type === 'income'
    const canEdit   = showEdit && today === tx.transaction_date
    const isEditing = editingTxId === tx.id
    const badge     = CAT_BADGE[tx.category] ?? null
    if (isEditing) {
      return (
        <div className="py-2.5 px-1 border-b border-black/5 last:border-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', isIncome ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF3B30]/15 text-[#FF3B30]')}>
              {isIncome ? '입금' : '지출'} 수정중
            </span>
            <button onClick={() => setEditingTxId(null)}><X className="w-4 h-4 text-[#8E8E93]" /></button>
          </div>
          <div className="relative">
            <input type="text" inputMode="numeric" value={editAmount}
              onChange={(e) => setEditAmount(fmtNum(e.target.value))}
              className={cn('w-full px-3 py-2 rounded-xl text-[16px] font-bold outline-none pr-8', isIncome ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF3B30]/10 text-[#FF3B30]')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8E8E93]">원</span>
          </div>
          <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
            className="w-full px-3 py-2 bg-[#F2F2F7] rounded-xl text-[13px] outline-none"
          />
          <div className="flex items-center justify-between">
            <button onClick={() => setEditHasVat(!editHasVat)}
              className={cn('w-9 h-5 rounded-full relative transition-all', editHasVat ? 'bg-[#007AFF]' : 'bg-[#E5E5EA]')}>
              <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', editHasVat ? 'left-[18px]' : 'left-0.5')} />
            </button>
            <span className="text-[12px] text-[#8E8E93] flex-1 ml-2">부가세</span>
            <button onClick={() => updateTx.mutate(tx.id)} disabled={updateTx.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#007AFF] text-white rounded-xl text-[12px] font-semibold disabled:opacity-40">
              <Check className="w-3 h-3" />저장
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 py-2.5 border-b border-black/5 last:border-0">
        <span className="text-[11px] text-[#8E8E93] w-10 flex-shrink-0">
          {tx.transaction_date ? tx.transaction_date.slice(5).replace('-', '/') : '-'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            {badge && !isIncome && (
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0', badge.cls)}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#3C3C43] truncate">{tx.description || '-'}</p>
          {tx.project?.name && <p className="text-[10px] text-[#007AFF] truncate">{tx.project.name}</p>}
        </div>
        <span className={cn('text-[12px] font-semibold flex-shrink-0', isIncome ? 'text-[#34C759]' : 'text-[#FF3B30]')}>
          {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()}
        </span>
        {canEdit && (
          <button onClick={() => startTxEdit(tx)} className="w-6 h-6 flex items-center justify-center bg-[#F2F2F7] rounded-lg active:opacity-60 flex-shrink-0">
            <Pencil className="w-3 h-3 text-[#8E8E93]" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('ios-card overflow-hidden', isMe && 'border border-[#007AFF]/20')}>
      {/* 카드 헤더 */}
      <div className={cn('px-4 py-3', isMe ? 'bg-[#007AFF]/5' : 'bg-[#F9F9FB]')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', isMe ? 'bg-[#007AFF]' : 'bg-[#8E8E93]/20')}>
              <span className={cn('text-[14px] font-bold', isMe ? 'text-white' : 'text-[#3C3C43]')}>
                {acc.name?.charAt(0) || '?'}
              </span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-black">
                {acc.name}
                {isMe && <span className="ml-1 text-[11px] text-[#007AFF] font-normal">나</span>}
              </p>
              <p className="text-[11px] text-[#8E8E93]">초기 {Number(acc.initial_balance || 0).toLocaleString()}원</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#8E8E93] mb-0.5">잔액</p>
            <p className={cn('text-[18px] font-bold', Number(acc.current_balance) >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]')}>
              {Number(acc.current_balance).toLocaleString()}원
            </p>
          </div>
        </div>

        {/* 잔액 수정 폼 */}
        {editingBalance && (
          <div className="mt-3 bg-white rounded-xl p-2.5 flex items-center gap-2 border border-[#5856D6]/15">
            <div className="relative flex-1">
              <input type="text" inputMode="numeric"
                value={Number(editVal).toLocaleString()}
                onChange={(e) => setEditVal(e.target.value.replace(/,/g,'').replace(/[^-\d]/g,''))}
                className="w-full px-3 py-2 bg-[#F8F8FF] rounded-xl text-[14px] font-bold text-[#5856D6] outline-none pr-8 border border-[#5856D6]/20"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8E8E93]">원</span>
            </div>
            <button onClick={() => setEditingBalance(false)} className="px-2.5 py-1.5 bg-[#F2F2F7] rounded-xl text-[12px] text-[#8E8E93]">취소</button>
            <button onClick={() => updateBalance.mutate(parseInt(editVal || '0'))} disabled={updateBalance.isPending}
              className="px-2.5 py-1.5 bg-[#5856D6] text-white rounded-xl text-[12px] font-bold disabled:opacity-50">저장</button>
          </div>
        )}

        {/* 버튼 행 */}
        <div className="flex gap-2 mt-2.5">
          {isOwner && !editingBalance && (
            <>
              <button
                onClick={() => { setEditingBalance(true); setEditVal(String(Number(acc.current_balance))) }}
                className="flex-1 py-1.5 rounded-xl bg-[#5856D6]/10 text-[#5856D6] text-[12px] font-semibold active:opacity-70"
              >
                잔액수정
              </button>
              {/* 초기화 버튼: 나(isMe)이고 owner인 경우만 표시 */}
              {isMe && isOwner && (
                <button
                  onClick={() => {
                    if (confirm(`"${acc.name}" 시재를 초기화할까요?\n\n⚠️ 거래내역이 전부 삭제되고 잔액이 0원으로 리셋됩니다.\n이 작업은 되돌릴 수 없습니다.`)) {
                      resetAccount.mutate()
                    }
                  }}
                  disabled={resetAccount.isPending}
                  className="flex-1 py-1.5 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[12px] font-semibold active:opacity-70 disabled:opacity-40"
                >
                  {resetAccount.isPending ? '초기화중...' : '초기화'}
                </button>
              )}
            </>
          )}
          {/* 모바일: 팝업 상세보기 / PC: 아코디언 펼침 */}
          <button
            onClick={() => onDetail(acc)}
            className="flex-1 py-1.5 rounded-xl bg-[#8E8E93]/10 text-[#3C3C43] text-[12px] font-semibold active:opacity-70 md:hidden"
          >
            상세보기
          </button>
          <button
            onClick={() => { setPcOpen(!pcOpen); setDetailExpanded(false); setEditingTxId(null) }}
            className={cn(
              'flex-1 py-1.5 rounded-xl text-[12px] font-semibold active:opacity-70 hidden md:flex items-center justify-center gap-1',
              pcOpen ? 'bg-[#1C1C1E] text-white' : 'bg-[#8E8E93]/10 text-[#3C3C43]'
            )}
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', pcOpen && 'rotate-180')} />
            {pcOpen ? '접기' : '상세보기'}
          </button>
          <button
            onClick={() => onEntry(acc)}
            className="flex-1 py-1.5 rounded-xl bg-[#FF9500] text-white text-[12px] font-semibold active:opacity-70"
          >
            💸 기입
          </button>
        </div>
      </div>

      {/* ── 거래 미리보기 (항상 표시, 최근 5건) ── */}
      <div className="border-t border-black/5">
        {previewList.length > 0 ? (
          <div className="px-4 pt-1 pb-0">
            {previewList.map((tx: any) => (
              <TxRow key={tx.id} tx={tx} showEdit={false} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-2.5 text-center">
            <p className="text-[12px] text-[#C7C7CC]">거래내역 없음</p>
          </div>
        )}

        {/* 더보기 버튼 (모바일: 팝업 / PC: 아코디언) */}
        {hasMoreTx && (
          <>
            {/* 모바일용 더보기 → 팝업 */}
            <button
              onClick={() => onDetail(acc)}
              className="md:hidden w-full flex items-center justify-center gap-1 py-2.5 text-[12px] text-[#007AFF] font-semibold border-t border-black/5 active:opacity-70"
            >
              <ChevronDown className="w-4 h-4" />
              +{txList.length - PREVIEW}건 더보기
            </button>
            {/* PC용 더보기 → 같은 아코디언 */}
            {!pcOpen && (
              <button
                onClick={() => { setPcOpen(true); setDetailExpanded(true) }}
                className="hidden md:flex w-full items-center justify-center gap-1 py-2.5 text-[12px] text-[#007AFF] font-semibold border-t border-black/5 active:opacity-70"
              >
                <ChevronDown className="w-4 h-4" />
                +{txList.length - PREVIEW}건 더보기
              </button>
            )}
          </>
        )}
      </div>

      {/* ── PC 전용 인라인 상세 아코디언 (미리보기 5건 이후 나머지만 표시) ── */}
      {pcOpen && txList.length > PREVIEW && (
        <div className="hidden md:block border-t border-black/5">
          <div className="px-4 py-1">
            {txList.slice(PREVIEW).map((tx: any) => (
              <TxRow key={tx.id} tx={tx} showEdit={true} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 시재 ───────────────────────────────────
function CashTab({ profile }: { profile: any }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [showAddCash, setShowAddCash] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<any>(null)
  const [showEntry, setShowEntry] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const isOwner = profile.role === 'owner'

  const { data: accounts = [], refetch } = useQuery({
    queryKey: ['cash-accounts', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_accounts')
        .select('id, company_id, user_id, name, initial_balance, current_balance, is_active')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // 나 먼저 정렬
  const sortedAccounts = [...accounts].sort((a: any, b: any) => {
    if (a.user_id === profile.id) return -1
    if (b.user_id === profile.id) return 1
    return 0
  })

  const total = accounts.reduce((s: number, a: any) => s + Number(a.current_balance), 0)

  return (
    <div className="p-4 space-y-4">
      {/* 전체 시재 합계 */}
      <div className="rounded-2xl p-5" style={{ background: '#007AFF', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <p className="text-white/80 text-[13px]">전체 시재 합계</p>
        <p className="text-white text-[30px] font-bold mt-1">
          {total.toLocaleString()}
          <span className="text-[16px] font-normal ml-1">원</span>
        </p>
      </div>

      {/* 개인별 시재 — 3열 카드 그리드 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
            개인별 시재 ({accounts.length}명)
          </p>
          <button
            onClick={() => setShowAddCash(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#007AFF] text-white rounded-xl text-[13px] font-semibold active:opacity-70"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            추가
          </button>
        </div>
        {accounts.length === 0 ? (
          <div className="ios-card p-8 text-center">
            <p className="text-[32px] mb-2">💰</p>
            <p className="text-[14px] text-[#8E8E93] mb-3">등록된 시재 계좌가 없습니다</p>
            <button
              onClick={() => setShowAddCash(true)}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-xl text-[14px] font-semibold active:opacity-70"
            >
              시재 계좌 추가하기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {sortedAccounts.map((acc: any) => (
              <CashPersonCard
                key={acc.id}
                acc={acc}
                profile={profile}
                isOwner={isOwner}
                onEntry={(a) => { setSelectedAccount(a); setShowEntry(true) }}
                onDetail={(a) => { setSelectedAccount(a); setShowDetail(true) }}
              />
            ))}
          </div>
        )}
      </div>

      <AddCashAccountSheet
        open={showAddCash}
        onClose={() => setShowAddCash(false)}
        onSuccess={() => refetch()}
        profile={profile}
      />

      {/* 시재 기입 / 상세 Sheet */}
      {selectedAccount && (
        <>
          <CashEntrySheet
            open={showEntry}
            onClose={() => { setShowEntry(false); refetch() }}
            account={selectedAccount}
            profile={profile}
          />
          <CashDetailSheet
            open={showDetail}
            onClose={() => setShowDetail(false)}
            account={{
              ...selectedAccount,
              current_balance: accounts.find((a: any) => a.id === selectedAccount.id)?.current_balance ?? selectedAccount.current_balance,
            }}
            profile={profile}
          />
        </>
      )}
    </div>
  )
}

// ─── 현장 정산서 Sheet ──────────────────────
function ProjectStatementSheet({
  project, transactions, incomeTotal, expenseTotal, onClose,
}: {
  project: any
  transactions: any[]
  incomeTotal: number
  expenseTotal: number
  onClose: () => void
}) {
  // 카테고리별 분류
  const revenueList = transactions.filter((t: any) => t.category === 'REVENUE')
  const cogsList    = transactions.filter((t: any) => t.category === 'COGS')
  const siteList    = transactions.filter((t: any) => t.category === 'SITE_EXPENSE')
  const expenseList = transactions.filter((t: any) => t.type === 'expense')

  const cogsTotal   = cogsList.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const siteTotal   = siteList.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const profit      = incomeTotal - expenseTotal
  const profitRate  = incomeTotal > 0 ? Math.round((profit / incomeTotal) * 100) : 0

  const vatAmount = (tx: any) => {
    if (!tx.has_vat) return null
    return Math.round(Number(tx.amount) * 0.1)
  }

  const payLabel = (method: string) => {
    if (method === 'transfer') return '계좌이체'
    if (method === 'cash')     return '현금'
    if (method === 'card')     return '카드'
    return method ?? '-'
  }

  // ── 새 창 인쇄 핸들러 ──────────────────────────────────────────────
  const handlePrint = () => {
    const fmtDate = (dateStr: string) => {
      try {
        const d = new Date(dateStr)
        const yy = String(d.getFullYear()).slice(2)
        const mm = d.getMonth() + 1
        const dd = d.getDate()
        const days = ['일','월','화','수','목','금','토']
        return `${yy}.${mm}.${dd}(${days[d.getDay()]})`
      } catch { return dateStr }
    }

    const buildSection = (
      emoji: string, label: string,
      list: any[], total: number,
      amtColor: string, prefix: string
    ) => {
      const rows = list.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:10px;">내역 없음</td></tr>`
        : list.map(tx => {
            const vat = tx.has_vat ? Math.round(Number(tx.amount) * 0.1).toLocaleString() : '-'
            const sub = tx.sub_category ? `<span style="color:#aaa;font-size:10px;">[${tx.sub_category}]</span> ` : ''
            return `
              <tr>
                <td style="color:#888;white-space:nowrap;">${fmtDate(tx.transaction_date)}</td>
                <td>${sub}${tx.description ?? ''}</td>
                <td style="text-align:right;font-weight:600;color:${amtColor};white-space:nowrap;">${prefix}${Number(tx.amount).toLocaleString()}</td>
                <td style="text-align:right;color:#888;white-space:nowrap;">${vat}</td>
                <td style="text-align:right;color:#888;white-space:nowrap;">${payLabel(tx.payment_method)}</td>
              </tr>`
          }).join('')
      const totalVat = list.filter(t => t.has_vat).reduce((s: number, t: any) => s + Math.round(Number(t.amount) * 0.1), 0)
      const subtotal = `
        <tr style="background:#f5f5f7;font-weight:700;">
          <td colspan="2">합계 (${list.length}건)</td>
          <td style="text-align:right;color:${amtColor};white-space:nowrap;">${prefix}${total.toLocaleString()}</td>
          <td style="text-align:right;color:#888;white-space:nowrap;">${totalVat > 0 ? totalVat.toLocaleString() : '-'}</td>
          <td></td>
        </tr>`
      return `
        <p class="section-title">${emoji} ${label}</p>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th class="col-date">날짜</th>
              <th class="col-desc">내용</th>
              <th class="col-amt">공급가</th>
              <th class="col-vat">부가세</th>
              <th class="col-pay">결제</th>
            </tr></thead>
            <tbody>${rows}${subtotal}</tbody>
          </table>
        </div>`
    }

    const profitColor = profit >= 0 ? '#007AFF' : '#FF3B30'
    const profitSign  = profit >= 0 ? '+' : ''

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${project.name} - 현장 정산서</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 12px; color: #111; background: #fff; padding: 20mm 15mm; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
    .sub { color: #888; font-size: 11px; margin-bottom: 4px; }
    .contract { color: #555; font-size: 11px; margin-bottom: 16px; }
    .summary { border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
    .summary-title { background: #f5f5f7; padding: 8px 14px; font-size: 11px; color: #888; font-weight: 600; border-bottom: 1px solid #e8e8e8; }
    .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; border-bottom: 1px solid #f0f0f0; }
    .summary-row:last-child { border-bottom: none; background: #fafafa; }
    .summary-label { font-size: 12px; color: #444; }
    .summary-value { font-size: 13px; font-weight: 700; }
    .profit-rate { font-size: 11px; font-weight: 600; margin-top: 1px; }
    .section-title { font-size: 13px; font-weight: 700; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #f5f5f7; }
    thead th { padding: 7px 8px; text-align: left; color: #888; font-weight: 600; border-bottom: 1px solid #e0e0e0; }
    thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: right; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 6px 8px; vertical-align: top; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5) { text-align: right; }
    .col-date { width: 78px; }
    .col-amt  { width: 105px; }
    .col-vat  { width: 70px; }
    .col-pay  { width: 62px; }
    .table-wrap { border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    @media print {
      body { padding: 0; }
      @page { margin: 15mm 12mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <p class="sub">현장 정산서</p>
  <h1>${project.name}</h1>
  ${project.contract_amount ? `<p class="contract">계약금액: ${Number(project.contract_amount).toLocaleString()}원</p>` : '<div style="height:14px;"></div>'}

  <div class="summary">
    <div class="summary-title">손익 요약</div>
    <div class="summary-row">
      <span class="summary-label">💰 매출</span>
      <span class="summary-value" style="color:#34C759;">+${incomeTotal.toLocaleString()}원</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">🔨 매출원가</span>
      <span class="summary-value" style="color:#FF3B30;">-${cogsTotal.toLocaleString()}원</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">🏗️ 현장경비</span>
      <span class="summary-value" style="color:#FF9500;">-${siteTotal.toLocaleString()}원</span>
    </div>
    <div class="summary-row">
      <span class="summary-label" style="font-weight:700;font-size:13px;">현장이익</span>
      <div style="text-align:right;">
        <div class="summary-value" style="color:${profitColor};">${profitSign}${profit.toLocaleString()}원</div>
        <div class="profit-rate" style="color:${profitColor};">수익률 ${profitRate}%</div>
      </div>
    </div>
  </div>

  ${buildSection('💰', '매출', revenueList, incomeTotal, '#34C759', '+')}
  ${buildSection('🔨', '매출원가', cogsList, cogsTotal, '#FF3B30', '-')}
  ${buildSection('🏗️', '현장경비', siteList, siteTotal, '#FF9500', '-')}
</body>
</html>`

    const pw = window.open('', '_blank', 'width=820,height=960')
    if (!pw) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return }
    pw.document.open()
    pw.document.write(html)
    pw.document.close()
    pw.addEventListener('load', () => { pw.focus(); pw.print() })
  }
  // ───────────────────────────────────────────────────────────────────

  // ── 화면 공통 TxTable (섹션별) ─────────────────────────────────────
  const TxTable = ({
    list, amtColor, prefix,
  }: { list: any[]; amtColor: string; prefix: string }) => (
    <div className="border border-black/6 rounded-b-xl overflow-hidden divide-y divide-black/5">
      {list.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-[#8E8E93]">내역 없음</div>
      ) : (
        <>
          {list.map((tx: any) => {
            const vat = vatAmount(tx)
            return (
              <div key={tx.id} className="grid grid-cols-[76px_1fr_96px_66px_56px] gap-1 px-3 py-2.5 items-start">
                <span className="text-[10px] text-[#8E8E93] pt-0.5">
                  {format(new Date(tx.transaction_date), 'yy.M.d(E)', { locale: ko })}
                </span>
                <div>
                  <p className="text-[12px] text-black leading-snug break-words">{tx.description}</p>
                  {tx.sub_category && (
                    <p className="text-[10px] text-[#8E8E93] mt-0.5">{tx.sub_category}</p>
                  )}
                </div>
                <span className={cn('text-[12px] font-semibold text-right', amtColor)}>
                  {prefix}{Number(tx.amount).toLocaleString()}
                </span>
                <span className="text-[10px] text-[#8E8E93] text-right pt-0.5">
                  {vat != null ? vat.toLocaleString() : '-'}
                </span>
                <span className="text-[10px] text-[#8E8E93] text-right pt-0.5">{payLabel(tx.payment_method)}</span>
              </div>
            )
          })}
          {/* 소계 */}
          <div className="grid grid-cols-[76px_1fr_96px_66px_56px] gap-1 px-3 py-2 bg-[#F9F9FB] items-center">
            <span className="text-[10px] text-[#8E8E93] col-span-2 font-semibold">합계 ({list.length}건)</span>
            <span className={cn('text-[12px] font-bold text-right', amtColor)}>
              {prefix}{list.reduce((s: number, t: any) => s + Number(t.amount), 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-[#8E8E93] text-right">
              {list.filter((t: any) => t.has_vat).reduce((s: number, t: any) => s + Math.round(Number(t.amount) * 0.1), 0) > 0
                ? list.filter((t: any) => t.has_vat).reduce((s: number, t: any) => s + Math.round(Number(t.amount) * 0.1), 0).toLocaleString()
                : '-'}
            </span>
            <span />
          </div>
        </>
      )}
    </div>
  )

  const SectionBlock = ({
    emoji, label, list, amtColor, prefix, borderColor,
  }: { emoji: string; label: string; list: any[]; amtColor: string; prefix: string; borderColor: string }) => (
    <div className="mb-4">
      {/* 섹션 헤더 */}
      <div className={cn('px-3 py-2 rounded-t-xl flex items-center justify-between', borderColor)}>
        <span className="text-[12px] font-bold text-black">{emoji} {label}</span>
        <span className={cn('text-[12px] font-bold', amtColor)}>
          {list.length}건 · {prefix}{list.reduce((s: number, t: any) => s + Number(t.amount), 0).toLocaleString()}원
        </span>
      </div>
      {/* 컬럼 헤더 */}
      <div className="grid grid-cols-[76px_1fr_96px_66px_56px] gap-1 px-3 py-1.5 bg-[#F2F2F7] border-x border-black/6">
        <span className="text-[9px] text-[#8E8E93] font-semibold">날짜</span>
        <span className="text-[9px] text-[#8E8E93] font-semibold">내용</span>
        <span className="text-[9px] text-[#8E8E93] font-semibold text-right">공급가</span>
        <span className="text-[9px] text-[#8E8E93] font-semibold text-right">부가세</span>
        <span className="text-[9px] text-[#8E8E93] font-semibold text-right">결제</span>
      </div>
      <TxTable list={list} amtColor={amtColor} prefix={prefix} />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/8">
        <button onClick={onClose} className="text-[#007AFF] text-[14px] font-medium active:opacity-60">닫기</button>
        <p className="text-[15px] font-bold text-black">현장 정산서</p>
        <button onClick={handlePrint} className="text-[#007AFF] text-[14px] font-medium active:opacity-60">인쇄</button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* 현장 정보 헤더 */}
        <div className="rounded-2xl p-4 bg-[#1C1C1E]">
          <p className="text-white/60 text-[11px] font-medium">현장 정산서</p>
          <p className="text-white text-[20px] font-bold mt-0.5">{project.name}</p>
          {project.contract_amount && (
            <p className="text-white/50 text-[12px] mt-1">
              계약금액: {Number(project.contract_amount).toLocaleString()}원
            </p>
          )}
        </div>

        {/* 손익 요약 카드 */}
        <div className="rounded-2xl border border-black/8 overflow-hidden">
          <div className="px-4 py-3 bg-[#F9F9FB] border-b border-black/6">
            <p className="text-[12px] font-semibold text-[#8E8E93]">손익 요약</p>
          </div>
          <div className="divide-y divide-black/5">
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-[12px] text-black">💰 매출</span>
              <span className="text-[13px] font-bold text-[#34C759]">+{incomeTotal.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-[12px] text-black">🔨 매출원가</span>
              <span className="text-[13px] font-bold text-[#FF3B30]">-{cogsTotal.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-[12px] text-black">🏗️ 현장경비</span>
              <span className="text-[13px] font-bold text-[#FF9500]">-{siteTotal.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-[#F9F9FB]">
              <span className="text-[14px] font-bold text-black">현장이익</span>
              <div className="text-right">
                <span className={cn('text-[16px] font-bold', profit >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]')}>
                  {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원
                </span>
                <p className={cn('text-[11px] font-semibold mt-0.5', profit >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]')}>
                  수익률 {profitRate}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 3 섹션: 매출 / 매출원가 / 현장경비 */}
        <SectionBlock
          emoji="💰" label="매출"
          list={revenueList} amtColor="text-[#34C759]" prefix="+"
          borderColor="bg-[#34C759]/10"
        />
        <SectionBlock
          emoji="🔨" label="매출원가"
          list={cogsList} amtColor="text-[#FF3B30]" prefix="-"
          borderColor="bg-[#FF3B30]/10"
        />
        <SectionBlock
          emoji="🏗️" label="현장경비"
          list={siteList} amtColor="text-[#FF9500]" prefix="-"
          borderColor="bg-[#FF9500]/10"
        />

        {/* 인쇄 버튼 */}
        <div className="pt-1 pb-6">
          <button
            onClick={handlePrint}
            className="w-full py-3.5 rounded-2xl bg-[#007AFF] text-white text-[15px] font-semibold active:opacity-80 flex items-center justify-center gap-2"
          >
            🖨️ 인쇄 / PDF 저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 현장 손익 ──────────────────────────────
function ProjectPLTab({
  profile,
}: {
  profile: any
}) {
  const supabase = createClient()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const yearStart = `${selectedYear}-01-01`
  const yearEnd   = `${selectedYear}-12-31`
  const currentYear = new Date().getFullYear()

  // 전체 현장 + 거래합산 (최신 프로젝트 우선)
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['project-pl-year', profile.company_id, yearStart, yearEnd],
    queryFn: async () => {
      const { data: pjs } = await supabase
        .from('projects')
        .select('id, name, contract_amount, created_at, status')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
      if (!pjs) return []

      const results = await Promise.all(
        pjs.map(async (p: any) => {
          const { data: txs } = await supabase
            .from('transactions')
            .select('type, category, amount')
            .eq('company_id', profile.company_id)
            .eq('project_id', p.id)
            .eq('is_voided', false)
            .gte('transaction_date', yearStart)
            .lte('transaction_date', yearEnd)

          const revenue  = txs?.filter((t) => t.category === 'REVENUE').reduce((s, t) => s + Number(t.amount), 0) ?? 0
          const expenses = txs?.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) ?? 0
          const profit     = revenue - expenses
          const profitRate = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
          return { ...p, revenue, expenses, profit, profitRate }
        })
      )
      // 거래 없는 현장도 모두 포함 (0원으로 표시)
      return results
    },
    staleTime: 0,
  })

  const CATEGORY_LABELS: Record<string, string> = {
    REVENUE: '매출', COGS: '원가', SGA: '판관비', NON_OPERATING: '영업외', TAX: '세금', SITE_EXPENSE: '현장경비',
  }
  const CATEGORY_COLOR: Record<string, string> = {
    REVENUE: 'bg-[#34C759]/15 text-[#34C759]',
    COGS:    'bg-[#FF3B30]/15 text-[#FF3B30]',
    SGA:     'bg-[#FF9500]/15 text-[#FF9500]',
    NON_OPERATING: 'bg-[#8E8E93]/15 text-[#8E8E93]',
    TAX:     'bg-[#FF2D55]/15 text-[#FF2D55]',
    SITE_EXPENSE: 'bg-[#5AC8FA]/15 text-[#5AC8FA]',
  }

  // ── 아코디언 현장 카드
  function ProjectCard({ p, rank }: { p: any; rank: number }) {
    const [open, setOpen]           = useState(false)
    const [showStatement, setShowStatement] = useState(false)
    // 섹션별 펼치기 상태
    const [revExpanded,  setRevExpanded]  = useState(false)
    const [cogsExpanded, setCogsExpanded] = useState(false)
    const [siteExpanded, setSiteExpanded] = useState(false)
    const SEC_LIMIT = 10

    const { data: transactions = [], isLoading: txLoading } = useQuery({
      queryKey: ['project-detail-tx-year', p.id, yearStart, yearEnd],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, type, category, amount, description, transaction_date, payment_method, has_vat, sub_category')
          .eq('company_id', profile.company_id)
          .eq('project_id', p.id)
          .eq('is_voided', false)
          .gte('transaction_date', yearStart)
          .lte('transaction_date', yearEnd)
          .order('transaction_date', { ascending: false })
        if (error) throw error
        return data || []
      },
      enabled: open,
      staleTime: 0,
    })

    // 카테고리별 분류
    const revenueList  = transactions.filter((t: any) => t.category === 'REVENUE')
    const cogsList     = transactions.filter((t: any) => t.category === 'COGS')
    const siteExpList  = transactions.filter((t: any) => t.category === 'SITE_EXPENSE')
    const incomeList   = transactions.filter((t: any) => t.type === 'income')
    const expenseList  = transactions.filter((t: any) => t.type === 'expense')
    const incomeTotal  = revenueList.reduce((s: number, t: any) => s + Number(t.amount), 0)
    const cogsTotal    = cogsList.reduce((s: number, t: any) => s + Number(t.amount), 0)
    const siteTotal    = siteExpList.reduce((s: number, t: any) => s + Number(t.amount), 0)
    const expenseTotal = expenseList.reduce((s: number, t: any) => s + Number(t.amount), 0)

    const TxRow = ({ tx }: { tx: any }) => (
      <div className="py-2.5 border-b border-black/4 last:border-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {tx.sub_category && (
                <span className="text-[10px] bg-gray-100 text-[#8E8E93] px-1.5 py-0.5 rounded-full">{tx.sub_category}</span>
              )}
              {tx.has_vat && (
                <span className="text-[10px] bg-[#007AFF]/10 text-[#007AFF] px-1.5 py-0.5 rounded-full">계산서</span>
              )}
            </div>
            <p className="text-[13px] font-medium text-black truncate">{tx.description}</p>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">
              {format(new Date(tx.transaction_date), 'M/d (E)', { locale: ko })}
              {tx.payment_method === 'cash' && ' · 시재'}
              {tx.payment_method === 'transfer' && ' · 계좌이체'}
              {tx.payment_method === 'card' && ' · 카드'}
            </p>
          </div>
          <p className={cn('text-[14px] font-bold flex-shrink-0', tx.type === 'income' ? 'text-[#34C759]' : 'text-[#FF3B30]')}>
            {tx.type === 'income' ? '+' : '-'}{Number(tx.amount).toLocaleString()}원
          </p>
        </div>
      </div>
    )

    // 섹션 렌더러
    const TxSection = ({
      emoji, label, list, total, color, expanded, onToggle,
    }: {
      emoji: string; label: string; list: any[]; total: number
      color: string; expanded: boolean; onToggle: () => void
    }) => {
      const displayed = expanded ? list : list.slice(0, SEC_LIMIT)
      const hasMore   = list.length > SEC_LIMIT
      const sign      = color === 'text-[#34C759]' ? '+' : '-'
      return (
        <div className="mb-1">
          {/* 섹션 헤더 */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#F9F9FB] border-b border-black/5">
            <span className="text-[12px] font-bold text-black">{emoji} {label} ({list.length}건)</span>
            <span className={cn('text-[13px] font-bold', color)}>
              {sign}{total.toLocaleString()}원
            </span>
          </div>
          {/* 항목 목록 */}
          {list.length === 0 ? (
            <div className="px-4 py-3 text-center text-[12px] text-[#8E8E93]">내역 없음</div>
          ) : (
            <div className="px-4">
              {displayed.map((tx: any) => <TxRow key={tx.id} tx={tx} />)}
              {hasMore && (
                <button
                  onClick={onToggle}
                  className="w-full py-2 mt-0.5 mb-1 text-[12px] font-semibold text-[#007AFF] bg-[#007AFF]/8 rounded-xl active:opacity-70"
                >
                  {expanded ? '▲ 접기' : `▼ 더보기 (${list.length - SEC_LIMIT}건)`}
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="ios-card overflow-hidden">
        {/* ── 카드 헤더: 현장명 / 매출 / 이익률 / 매출원가 ── */}
        <div className="px-4 pt-4 pb-3 bg-[#D1D1D6]">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
              <span className="text-[12px] font-bold text-[#6C6C70] flex-shrink-0 bg-white/60 rounded-lg px-2 py-0.5">{rank}</span>
              <p className="text-[16px] font-bold text-black truncate">{p.name}</p>
            </div>
            <span className={cn('text-[15px] font-bold flex-shrink-0', p.profit >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]')}>
              {p.profitRate}%
            </span>
          </div>
          {/* 매출 | 매출이익 | 매출원가 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#34C759]/8 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-[#8E8E93] mb-0.5">매출</p>
              <p className="text-[13px] font-bold text-[#34C759]">
                {p.revenue >= 10000 ? `+${(p.revenue/10000).toFixed(0)}만` : `+${p.revenue.toLocaleString()}`}
              </p>
            </div>
            <div className={cn('rounded-xl p-2.5 text-center', p.profit >= 0 ? 'bg-[#007AFF]/8' : 'bg-[#FF3B30]/8')}>
              <p className="text-[10px] text-[#8E8E93] mb-0.5">매출이익</p>
              <p className={cn('text-[13px] font-bold', p.profit >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]')}>
                {p.profit >= 10000 || p.profit <= -10000
                  ? `${p.profit >= 0 ? '+' : ''}${(p.profit/10000).toFixed(0)}만`
                  : `${p.profit >= 0 ? '+' : ''}${p.profit.toLocaleString()}`}
              </p>
            </div>
            <div className="bg-[#FF3B30]/8 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-[#8E8E93] mb-0.5">매출원가</p>
              <p className="text-[13px] font-bold text-[#FF3B30]">
                {p.expenses >= 10000 ? `-${(p.expenses/10000).toFixed(0)}만` : `-${p.expenses.toLocaleString()}`}
              </p>
            </div>
          </div>
          {/* 이익률 바 */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', p.profit >= 0 ? 'bg-[#34C759]' : 'bg-[#FF3B30]')}
              style={{ width: `${Math.min(Math.abs(p.profitRate), 100)}%` }}
            />
          </div>
          {/* 상세보기 토글 버튼 */}
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-semibold transition-colors active:opacity-70',
              open ? 'bg-[#1C1C1E] text-white' : 'bg-[#E5E5EA] text-[#3C3C43]'
            )}
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', open && 'rotate-180')} />
            {open ? '접기' : '상세보기'}
          </button>
        </div>

        {/* ── 아코디언 상세 영역 ── */}
        {open && (
          <div>
            {txLoading ? (
              <div className="py-8 text-center text-[13px] text-[#8E8E93]">불러오는 중...</div>
            ) : (
              <>
                {/* 매출 섹션 */}
                <TxSection
                  emoji="💰" label="매출"
                  list={revenueList} total={incomeTotal}
                  color="text-[#34C759]"
                  expanded={revExpanded} onToggle={() => setRevExpanded(v => !v)}
                />
                {/* 매출원가 섹션 */}
                <TxSection
                  emoji="🔨" label="매출원가"
                  list={cogsList} total={cogsTotal}
                  color="text-[#FF3B30]"
                  expanded={cogsExpanded} onToggle={() => setCogsExpanded(v => !v)}
                />
                {/* 현장경비 섹션 */}
                <TxSection
                  emoji="🏗️" label="현장경비"
                  list={siteExpList} total={siteTotal}
                  color="text-[#FF9500]"
                  expanded={siteExpanded} onToggle={() => setSiteExpanded(v => !v)}
                />

                {/* 합계 풋터 */}
                <div className="px-4 pt-2 pb-3">
                  <div className="bg-[#F9F9FB] rounded-xl px-3 py-2.5 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] text-[#8E8E93]">매출 합계</span>
                      <span className="text-[13px] font-bold text-[#34C759]">+{incomeTotal.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] text-[#8E8E93]">지출 합계</span>
                      <span className="text-[13px] font-bold text-[#FF3B30]">-{expenseTotal.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-black/6">
                      <span className="text-[13px] font-bold text-black">현장이익</span>
                      <span className={cn('text-[14px] font-bold', (incomeTotal - expenseTotal) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]')}>
                        {(incomeTotal - expenseTotal) >= 0 ? '+' : ''}{(incomeTotal - expenseTotal).toLocaleString()}원
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 정산서 버튼 */}
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowStatement(true)}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-[#007AFF]/10 text-[#007AFF] active:opacity-70 flex items-center justify-center gap-1.5"
              >
                🖨️ 현장 정산서 보기
              </button>
            </div>
          </div>
        )}

        {/* 정산서 Sheet */}
        {showStatement && (
          <ProjectStatementSheet
            project={p}
            transactions={transactions}
            incomeTotal={incomeTotal}
            expenseTotal={expenseTotal}
            onClose={() => setShowStatement(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pb-8">
      {/* 연도 선택기 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-black/5 sticky top-0 z-10">
        <button
          onClick={() => setSelectedYear(y => y - 1)}
          className="text-[#007AFF] text-[14px] font-medium active:opacity-60 px-2"
        >
          ‹ 이전년도
        </button>
        <p className="text-[15px] font-semibold text-black">{selectedYear}년</p>
        <button
          onClick={() => setSelectedYear(y => y + 1)}
          className="text-[#007AFF] text-[14px] font-medium active:opacity-60 px-2"
          disabled={selectedYear >= currentYear}
        >
          다음년도 ›
        </button>
      </div>

      {/* 현장 목록 */}
      <div className="p-4">
        {isLoading ? (
          <div className="ios-card p-8 text-center">
            <p className="text-[13px] text-[#8E8E93]">불러오는 중...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="ios-card p-8 text-center">
            <p className="text-[32px] mb-2">🏗️</p>
            <p className="text-[14px] text-[#8E8E93]">{selectedYear}년 현장 손익 데이터가 없습니다</p>
          </div>
        ) : (
          <>
            {/* 연간 합계 요약 배너 */}
            <div className="rounded-2xl px-5 py-4 mb-4" style={{ background: '#1C1C1E', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              <p className="text-white/60 text-[12px] mb-2">{selectedYear}년 전체 현장 합계 ({projects.length}개)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-white/50 text-[10px] mb-0.5">매출</p>
                  <p className="text-[#34C759] text-[14px] font-bold">
                    +{(projects.reduce((s: number, p: any) => s + p.revenue, 0) / 10000).toFixed(0)}만
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-white/50 text-[10px] mb-0.5">이익</p>
                  {(() => {
                    const totalProfit = projects.reduce((s: number, p: any) => s + p.profit, 0)
                    return (
                      <p className={cn('text-[14px] font-bold', totalProfit >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]')}>
                        {totalProfit >= 0 ? '+' : ''}{(totalProfit / 10000).toFixed(0)}만
                      </p>
                    )
                  })()}
                </div>
                <div className="text-center">
                  <p className="text-white/50 text-[10px] mb-0.5">원가</p>
                  <p className="text-[#FF3B30] text-[14px] font-bold">
                    -{(projects.reduce((s: number, p: any) => s + p.expenses, 0) / 10000).toFixed(0)}만
                  </p>
                </div>
              </div>
            </div>
            {/* 현장 카드 목록: 모바일 1열 / PC 3열 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              {projects.map((p: any, idx: number) => (
                <ProjectCard key={p.id} p={p} rank={projects.length - idx} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 현장 손익 상세 Sheet ────────────────────
function ProjectDetailSheet({
  open, onClose, project, profile, monthStart, monthEnd
}: {
  open: boolean
  onClose: () => void
  project: any
  profile: any
  monthStart: string
  monthEnd: string
}) {
  const supabase = createClient()
  const [viewType, setViewType] = useState<'income' | 'expense'>('income')

  const CATEGORY_LABELS: Record<string, string> = {
    REVENUE: '매출', COGS: '원가', SGA: '판관비', NON_OPERATING: '영업외', TAX: '세금', SITE_EXPENSE: '현장경비',
  }
  const CATEGORY_COLOR: Record<string, string> = {
    REVENUE: 'bg-[#34C759]/15 text-[#34C759]',
    COGS: 'bg-[#FF3B30]/15 text-[#FF3B30]',
    SGA: 'bg-[#FF9500]/15 text-[#FF9500]',
    NON_OPERATING: 'bg-[#8E8E93]/15 text-[#8E8E93]',
    TAX: 'bg-[#FF2D55]/15 text-[#FF2D55]',
    SITE_EXPENSE: 'bg-[#5AC8FA]/15 text-[#5AC8FA]',
  }

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['project-detail-tx', project.id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id, type, category, amount, description, transaction_date,
          payment_method, has_vat, sub_category
        `)
        .eq('company_id', profile.company_id)
        .eq('project_id', project.id)
        .eq('is_voided', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: open,
    staleTime: 0,
  })

  const incomeList = transactions.filter((t: any) => t.type === 'income')
  const expenseList = transactions.filter((t: any) => t.type === 'expense')
  const incomeTotal = incomeList.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const expenseTotal = expenseList.reduce((s: number, t: any) => s + Number(t.amount), 0)

  const displayList = viewType === 'income' ? incomeList : expenseList

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pt-4 pb-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
            <SheetTitle className="text-[17px] font-semibold">{project.name}</SheetTitle>
            <div className="w-10" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* 요약: 매출 / 매출이익 / 매출원가 */}
          <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-black/5">
            <div className="ios-card p-3 text-center">
              <p className="text-[11px] text-[#8E8E93] mb-1">매출</p>
              <p className="text-[13px] font-bold text-[#34C759]">+{incomeTotal.toLocaleString()}</p>
            </div>
            <div
              className="ios-card p-3 text-center"
              style={{ backgroundColor: (incomeTotal - expenseTotal) >= 0 ? '#007AFF' : '#FF3B30' }}
            >
              <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.8)' }}>매출이익</p>
              <p className="text-[13px] font-bold" style={{ color: '#ffffff' }}>
                {(incomeTotal - expenseTotal) >= 0 ? '+' : ''}{(incomeTotal - expenseTotal).toLocaleString()}
              </p>
            </div>
            <div className="ios-card p-3 text-center">
              <p className="text-[11px] text-[#8E8E93] mb-1">원가</p>
              <p className="text-[13px] font-bold text-[#FF3B30]">-{expenseTotal.toLocaleString()}</p>
            </div>
          </div>

          {/* 수입 / 지출 토글 */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex rounded-xl overflow-hidden border border-black/10">
              <button
                onClick={() => setViewType('income')}
                className={cn(
                  'flex-1 py-2.5 text-[14px] font-semibold transition-all',
                  viewType === 'income' ? 'bg-[#34C759] text-white' : 'bg-white text-[#8E8E93]'
                )}
              >
                💰 수입 내역 ({incomeList.length}건)
              </button>
              <button
                onClick={() => setViewType('expense')}
                className={cn(
                  'flex-1 py-2.5 text-[14px] font-semibold transition-all',
                  viewType === 'expense' ? 'bg-[#FF3B30] text-white' : 'bg-white text-[#8E8E93]'
                )}
              >
                💸 지출 내역 ({expenseList.length}건)
              </button>
            </div>
          </div>

          {/* 내역 목록 */}
          <div className="px-4 py-2 space-y-2">
            {isLoading ? (
              <div className="py-8 text-center text-[14px] text-[#8E8E93]">불러오는 중...</div>
            ) : displayList.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[28px] mb-2">{viewType === 'income' ? '💰' : '💸'}</p>
                <p className="text-[14px] text-[#8E8E93]">
                  {viewType === 'income' ? '수입' : '지출'} 내역이 없습니다
                </p>
              </div>
            ) : (
              displayList.map((tx: any) => (
                <div key={tx.id} className="ios-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={cn(
                          'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                          CATEGORY_COLOR[tx.category] ?? 'bg-gray-100 text-[#8E8E93]'
                        )}>
                          {tx.category === 'SGA' && tx.sub_category
                            ? tx.sub_category
                            : CATEGORY_LABELS[tx.category] ?? tx.category}
                        </span>
                        {tx.sub_category && tx.category !== 'SGA' && (
                          <span className="text-[11px] bg-gray-100 text-[#8E8E93] px-2 py-0.5 rounded-full">
                            {tx.sub_category}
                          </span>
                        )}
                        {tx.has_vat && (
                          <span className="text-[11px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full">
                            세금계산서
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] font-medium text-black truncate">
                        {(tx.description || '').replace(/\s*\(계산서발행\)|\s*\(계산서미발행\)/g, '')}
                      </p>
                      <p className="text-[11px] text-[#8E8E93] mt-0.5">
                        {format(new Date(tx.transaction_date), 'M/d (E)', { locale: ko })}
                        {tx.payment_method === 'cash' && ' · 시재'}
                        {tx.payment_method === 'transfer' && ' · 계좌이체'}
                        {tx.payment_method === 'card' && ' · 카드'}
                      </p>
                    </div>
                    <p className={cn(
                      'text-[15px] font-bold flex-shrink-0',
                      tx.type === 'income' ? 'text-[#34C759]' : 'text-[#FF3B30]'
                    )}>
                      {tx.type === 'income' ? '+' : '-'}{Number(tx.amount).toLocaleString()}원
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── 회사 손익 ──────────────────────────────
function CompanyPLTab({ summary, profile, monthStart, monthEnd, currentMonth, recurringFixedTotal, recurringBaseItems, recurringOverrides }: {
  summary: any
  profile: any
  monthStart: string
  monthEnd: string
  currentMonth: Date
  recurringFixedTotal?: number
  recurringBaseItems?: any[]
  recurringOverrides?: any[]
}) {
  const supabase = createClient()
  const fixedMonthly = recurringFixedTotal ?? 0
  const currentMonthNum = currentMonth.getMonth() + 1 // 1~12

  // 오버라이드 적용한 누적 고정판관비 계산
  // 각 달(1월~현재월)의 고정판관비를 합산
  const yearFixedSgaCumulative = (() => {
    const baseItems = recurringBaseItems ?? []
    const overrides = recurringOverrides ?? []
    const year = currentMonth.getFullYear()
    let total = 0
    for (let m = 1; m <= currentMonthNum; m++) {
      const monthKey = `${year}-${String(m).padStart(2, '0')}`
      const items = getEffectiveFixedItemsFPC(baseItems, overrides, monthKey)
      total += items.reduce((s: number, i: any) => s + Number(i.amount), 0)
    }
    return total
  })()

  // 연도 누적 손익 (1/1 ~ 선택월 말 또는 오늘 중 이른 날짜)
  const yearStart = format(startOfYear(currentMonth), 'yyyy-MM-dd')
  const todayStr  = format(new Date(), 'yyyy-MM-dd')
  const yearEnd = monthEnd > todayStr ? todayStr : monthEnd

  const { data: yearRawData } = useQuery({
    queryKey: ['company-pl-year', profile.company_id, yearStart, yearEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, category, amount, is_voided, is_internal_transfer, description')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .gte('transaction_date', yearStart)
        .lte('transaction_date', yearEnd)
      if (error) throw error
      const pl = (data || []).filter((t: any) => !t.is_internal_transfer)
      const revenue    = pl.filter((t: any) => t.category === 'REVENUE').reduce((s: number, t: any) => s + Number(t.amount), 0)
      const cogs        = pl.filter((t: any) => t.category === 'COGS').reduce((s: number, t: any) => s + Number(t.amount), 0)
      const siteExpense  = pl.filter((t: any) => t.category === 'SITE_EXPENSE').reduce((s: number, t: any) => s + Number(t.amount), 0)
      // SGA 실적: 고정(정기) + 변동(비정기) 모두 transactions 기준
      const sgaFixed    = pl.filter((t: any) => t.category === 'SGA' && t.description?.startsWith('[정기]')).reduce((s: number, t: any) => s + Number(t.amount), 0)
      const sgaVariable = pl.filter((t: any) => t.category === 'SGA' && !t.description?.startsWith('[정기]')).reduce((s: number, t: any) => s + Number(t.amount), 0)
      const nonOp      = pl.filter((t: any) => t.category === 'NON_OPERATING' && t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0)
      const tax        = pl.filter((t: any) => t.category === 'TAX').reduce((s: number, t: any) => s + Number(t.amount), 0)
      return { revenue, cogs, siteExpense, sgaFixed, sgaVariable, nonOp, tax }
    },
  })

  // 연도 누적 SGA
  //  - 고정 판관비: recurring_expenses 월 고정금액 × 누적 개월 수 (1월~현재월)
  //  - 변동 판관비: 1월~오늘까지 transactions 비정기 SGA 실적 합계
  const yearSummary = yearRawData
    ? (() => {
        const sgaFixed        = yearFixedSgaCumulative                   // 고정 × 월별 오버라이드 적용 누적
        const sgaVariable     = yearRawData.sgaVariable ?? 0             // 변동: 직접 입력 실적
        const sga             = sgaFixed + sgaVariable
        const grossProfit     = yearRawData.revenue - yearRawData.cogs - (yearRawData.siteExpense ?? 0)
        const operatingProfit = grossProfit - sga
        const netProfit       = operatingProfit + yearRawData.nonOp - yearRawData.tax
        return { ...yearRawData, sga, sgaFixed, sgaVariable, grossProfit, operatingProfit, netProfit }
      })()
    : null

  // 월별 손익 계산서 rows
  const rows = [
    { label: '매출 (Revenue)',       value:  (summary?.revenue ?? 0),                 indent: false, color: 'text-[#34C759]' },
    { label: '  └ 매출원가 (COGS)',  value: -(summary?.cogs ?? 0),                    indent: true,  color: 'text-[#FF3B30]' },
    { label: '  └ 현장경비',         value: -(summary?.siteExpense ?? 0),             indent: true,  color: 'text-[#FF9500]' },
    { label: '매출총이익',            value:  (summary?.grossProfit ?? 0),             indent: false, bold: true, line: true, color: (summary?.grossProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
    { label: '  └ 고정 판관비',      value: -(summary?.sgaFixed ?? 0),                indent: true,  color: 'text-[#8E8E93]' },
    { label: '  └ 변동 판관비',      value: -(summary?.sgaVariable ?? 0),             indent: true,  color: 'text-[#8E8E93]' },
    { label: '판매관리비 합계',        value: -(summary?.sga ?? 0),                    indent: false, bold: true, color: 'text-[#FF3B30]' },
    { label: '영업이익',              value:  (summary?.operatingProfit ?? 0),         indent: false, bold: true, line: true, color: (summary?.operatingProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
    { label: '  └ 영업외 수익/비용', value:  (summary?.nonOp ?? 0),                  indent: true,  color: 'text-[#8E8E93]' },
    { label: '  └ 세금',             value: -(summary?.tax ?? 0),                     indent: true,  color: 'text-[#FF3B30]' },
    { label: '세전이익',              value:  (summary?.netProfit ?? 0),               indent: false, bold: true, big: true, line: true, color: (summary?.netProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
  ]

  // 연도 누적 rows — 판관비 고정+변동 2줄 분리 (MonthCard rows와 동일 구조)
  const yearRows = [
    { label: '매출 (Revenue)',       value:  (yearSummary?.revenue ?? 0),              indent: false, color: 'text-[#34C759]' },
    { label: '  └ 매출원가 (COGS)', value: -(yearSummary?.cogs ?? 0),                 indent: true,  color: 'text-[#FF3B30]' },
    { label: '  └ 현장경비',         value: -(yearSummary?.siteExpense ?? 0),          indent: true,  color: 'text-[#FF9500]' },
    { label: '매출총이익',            value:  (yearSummary?.grossProfit ?? 0),          indent: false, bold: true, line: true, color: (yearSummary?.grossProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
    { label: '  └ 고정 판관비',      value: -(yearSummary?.sgaFixed ?? 0),             indent: true,  color: 'text-[#8E8E93]' },
    { label: '  └ 변동 판관비',      value: -(yearSummary?.sgaVariable ?? 0),          indent: true,  color: 'text-[#8E8E93]' },
    { label: '판매관리비 합계',        value: -(yearSummary?.sga ?? 0),                 indent: false, bold: true, color: 'text-[#FF3B30]' },
    { label: '영업이익',              value:  (yearSummary?.operatingProfit ?? 0),      indent: false, bold: true, line: true, color: (yearSummary?.operatingProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
    { label: '  └ 영업외 수익/비용', value:  (yearSummary?.nonOp ?? 0),               indent: true,  color: 'text-[#8E8E93]' },
    { label: '  └ 세금',             value: -(yearSummary?.tax ?? 0),                  indent: true,  color: 'text-[#FF3B30]' },
    { label: '세전이익',              value:  (yearSummary?.netProfit ?? 0),            indent: false, bold: true, big: true, line: true, color: (yearSummary?.netProfit ?? 0) >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]' },
  ]

  const yr = currentMonth.getFullYear()

  // ── 현재월 손익 카드
  const monthNetProfit = summary?.netProfit ?? 0
  const MonthCard = (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-[#8E8E93]">
        📅 {format(currentMonth, 'M월', { locale: ko })} 손익
      </p>
      {/* 현재월 세전이익 하이라이트 카드 */}
      <div
        className="rounded-2xl p-4"
        style={{ background: monthNetProfit >= 0 ? '#007AFF' : '#FF3B30', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <p className="text-white/80 text-[12px] font-medium">{format(currentMonth, 'M월', { locale: ko })} 세전이익</p>
        <p className="text-white text-[22px] font-bold mt-0.5">
          {summary
            ? (monthNetProfit >= 0 ? '+' : '') + monthNetProfit.toLocaleString()
            : '—'}
          <span className="text-[13px] font-normal ml-1">원</span>
        </p>
        <p className="text-white/70 text-[11px] mt-1">
          매출 {(summary?.revenue ?? 0).toLocaleString()}원
        </p>
      </div>
      <div className="ios-card overflow-hidden">
        {rows.map((row: any, i) => (
          <div key={i}>
            {row.line && <div className="h-px bg-black/10 mx-4" />}
            <div className={cn(
              'flex items-center justify-between px-4 py-3',
              row.indent && 'pl-8 bg-gray-50/50',
              row.big && 'py-4',
            )}>
              <span className={cn(
                'text-[14px] text-[#3C3C43]',
                row.bold && 'font-semibold text-black',
                row.big && 'text-[16px] font-bold',
              )}>
                {row.label}
              </span>
              <span className={cn(
                'font-semibold',
                row.big ? 'text-[18px] font-bold' : 'text-[14px]',
                row.color,
              )}>
                {row.value >= 0 ? '+' : ''}{row.value.toLocaleString()}원
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── 누적 손익 카드
  const YearCard = (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-[#8E8E93]">
        📊 {yr}년 누적 (1월~{format(currentMonth, 'M월', { locale: ko })})
      </p>
      {/* 누적 세전이익 하이라이트 — MonthCard와 동일 스타일 */}
      <div
        className="rounded-2xl p-4"
        style={{ background: (yearSummary?.netProfit ?? 0) >= 0 ? '#007AFF' : '#FF3B30', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <p className="text-white/80 text-[12px] font-medium">{yr}년 누적 세전이익</p>
        <p className="text-white text-[22px] font-bold mt-0.5">
          {yearSummary
            ? (yearSummary.netProfit >= 0 ? '+' : '') + yearSummary.netProfit.toLocaleString()
            : '—'}
          <span className="text-[13px] font-normal ml-1">원</span>
        </p>
        <p className="text-white/70 text-[11px] mt-1">
          매출 {(yearSummary?.revenue ?? 0).toLocaleString()}원
        </p>
      </div>
      {/* 누적 손익 상세 테이블 — MonthCard와 동일 스타일 */}
      <div className="ios-card overflow-hidden">
        {yearRows.map((row: any, i: number) => (
          <div key={i}>
            {row.line && <div className="h-px bg-black/10 mx-4" />}
            <div className={cn(
              'flex items-center justify-between px-4 py-3',
              row.indent && 'pl-8 bg-gray-50/50',
              row.big && 'py-4',
            )}>
              <span className={cn(
                'text-[14px] text-[#3C3C43]',
                row.bold && 'font-semibold text-black',
                row.big && 'text-[16px] font-bold',
              )}>
                {row.label}
              </span>
              <span className={cn(
                'font-semibold',
                row.big ? 'text-[18px] font-bold' : 'text-[14px]',
                row.color,
              )}>
                {!yearRawData ? '—' : (row.value >= 0 ? '+' : '') + row.value.toLocaleString() + '원'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-4 pb-8">
      {/* 모바일: 세로 스택 / PC: 좌-현재월, 우-누적 2열 그리드 */}
      <div className="md:hidden space-y-4">
        {MonthCard}
        {YearCard}
      </div>
      <div className="hidden md:grid md:grid-cols-2 gap-5 items-start">
        {MonthCard}
        {YearCard}
      </div>
    </div>
  )
}

// ─── 자금흐름 달력 탭 ─────────────────────────────
function CashflowCalendarTab({
  profile,
  currentMonth,
}: {
  profile: any
  currentMonth: Date
}) {
  const supabase = createClient()
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd   = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  // 매출예정 (revenue)
  const { data: revenues = [] } = useQuery({
    queryKey: ['cashflow-cal-revenue', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, description, is_completed, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'revenue')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
      return data || []
    },
  })

  // 결제예정 (payment)
  const { data: payments = [] } = useQuery({
    queryKey: ['cashflow-cal-payment', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, scheduled_date, amount, description, is_completed, projects(name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'payment')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
      return data || []
    },
  })

  // 고정판관비 (recurring_expenses)
  const { data: fixedExpenses = [] } = useQuery({
    queryKey: ['cashflow-cal-fixed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount, billing_day')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return data || []
    },
    staleTime: 10 * 60 * 1000,
  })

  // ── 달력 생성 (일요일 첫 열) ──
  const year  = currentMonth.getFullYear()
  const month = currentMonth.getMonth()  // 0-indexed
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const firstDow = firstDay.getDay()  // 0=일

  // 날짜별 이벤트 맵
  type CalEvent = { type: 'revenue' | 'payment' | 'fixed'; label: string; amount: number; done?: boolean }
  const eventMap: Record<string, CalEvent[]> = {}

  const addEvent = (date: string, ev: CalEvent) => {
    if (!eventMap[date]) eventMap[date] = []
    eventMap[date].push(ev)
  }

  revenues.forEach((r: any) => {
    addEvent(r.scheduled_date, {
      type: 'revenue',
      label: (r.projects?.name || r.description || '매출').slice(0, 10),
      amount: Number(r.amount),
      done: r.is_completed,
    })
  })
  payments.forEach((p: any) => {
    addEvent(p.scheduled_date, {
      type: 'payment',
      label: (p.projects?.name || p.description || '결제').slice(0, 10),
      amount: Number(p.amount),
      done: p.is_completed,
    })
  })
  fixedExpenses.forEach((fe: any) => {
    const day = Number(fe.billing_day) || 25
    const maxDay = lastDay.getDate()
    const actualDay = Math.min(day, maxDay)
    const dateStr = `${format(currentMonth, 'yyyy-MM')}-${String(actualDay).padStart(2,'0')}`
    if (dateStr >= monthStart && dateStr <= monthEnd) {
      addEvent(dateStr, {
        type: 'fixed',
        label: (fe.name || '고정판관비').slice(0, 10),
        amount: Number(fe.amount),
      })
    }
  })

  // 달력 셀 배열 (빈칸 포함)
  const totalCells = Math.ceil((firstDow + lastDay.getDate()) / 7) * 7
  const DAY_LABELS = ['일','월','화','수','목','금','토']

  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="p-4">
      {/* 범례 */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#34C759] inline-block" />
          <span className="text-[11px] text-[#3C3C43]">공사대금</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#FF3B30] inline-block" />
          <span className="text-[11px] text-[#3C3C43]">결제예정</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#FF9500] inline-block" />
          <span className="text-[11px] text-[#3C3C43]">고정판관비</span>
        </div>
      </div>

      {/* 달력 */}
      <div className="ios-card overflow-hidden">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-black/5">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={cn(
              'text-center py-2 text-[11px] font-bold',
              i === 0 ? 'text-[#FF3B30]' : i === 6 ? 'text-[#007AFF]' : 'text-[#8E8E93]'
            )}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7">
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - firstDow + 1
            const isValid = dayNum >= 1 && dayNum <= lastDay.getDate()
            if (!isValid) return <div key={idx} className="border-b border-r border-black/4 min-h-[70px]" />

            const dateStr = `${format(currentMonth, 'yyyy-MM')}-${String(dayNum).padStart(2,'0')}`
            const isToday = dateStr === today
            const dow = idx % 7
            const events = eventMap[dateStr] || []

            // 해당 날짜 합계
            const revTotal = events.filter(e => e.type === 'revenue' && !e.done).reduce((s,e) => s+e.amount, 0)
            const payTotal = events.filter(e => e.type === 'payment' && !e.done).reduce((s,e) => s+e.amount, 0)
            const fixTotal = events.filter(e => e.type === 'fixed').reduce((s,e) => s+e.amount, 0)

            return (
              <div
                key={idx}
                className={cn(
                  'border-b border-r border-black/4 min-h-[70px] p-1',
                  idx % 7 === 6 && 'border-r-0',
                  isToday && 'bg-[#007AFF]/5'
                )}
              >
                {/* 날짜 숫자 */}
                <div className={cn(
                  'text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 mx-auto',
                  isToday ? 'bg-[#007AFF] text-white' :
                  dow === 0 ? 'text-[#FF3B30]' :
                  dow === 6 ? 'text-[#007AFF]' :
                  'text-[#1C1C1E]'
                )}>
                  {dayNum}
                </div>

                {/* 이벤트 뱃지 */}
                <div className="space-y-0.5">
                  {/* 공사대금 */}
                  {events.filter(e => e.type === 'revenue').map((e, ei) => (
                    <div key={`r${ei}`} className={cn(
                      'rounded px-1 py-0.5 text-[8px] font-semibold leading-tight truncate',
                      e.done ? 'bg-[#34C759]/10 text-[#34C759]/50 line-through' : 'bg-[#34C759]/15 text-[#34C759]'
                    )}>
                      📥 {(e.amount/10000).toFixed(0)}만
                    </div>
                  ))}
                  {/* 결제예정 */}
                  {events.filter(e => e.type === 'payment').map((e, ei) => (
                    <div key={`p${ei}`} className={cn(
                      'rounded px-1 py-0.5 text-[8px] font-semibold leading-tight truncate',
                      e.done ? 'bg-[#FF3B30]/10 text-[#FF3B30]/50 line-through' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                    )}>
                      📤 {(e.amount/10000).toFixed(0)}만
                    </div>
                  ))}
                  {/* 고정판관비 */}
                  {events.filter(e => e.type === 'fixed').map((e, ei) => (
                    <div key={`f${ei}`} className="bg-[#FF9500]/15 text-[#FF9500] rounded px-1 py-0.5 text-[8px] font-semibold leading-tight truncate">
                      🏢 {(e.amount/10000).toFixed(0)}만
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 이번달 이벤트 리스트 (날짜순) */}
      {Object.keys(eventMap).length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wide">이번달 일정</p>
          {Object.entries(eventMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, evs]) => (
              <div key={date} className="ios-card p-3">
                <p className="text-[12px] font-bold text-[#3C3C43] mb-1.5">{date.slice(5).replace('-','/')}</p>
                <div className="space-y-1">
                  {evs.map((e, ei) => (
                    <div key={ei} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full flex-shrink-0',
                          e.type === 'revenue' ? 'bg-[#34C759]' :
                          e.type === 'payment' ? 'bg-[#FF3B30]' :
                          'bg-[#FF9500]'
                        )} />
                        <span className={cn(
                          'text-[12px] text-[#3C3C43]',
                          e.done && 'line-through text-[#C7C7CC]'
                        )}>{e.label}</span>
                        {e.done && <span className="text-[9px] text-[#34C759] font-bold">✓완료</span>}
                      </div>
                      <span className={cn(
                        'text-[12px] font-bold ml-2',
                        e.type === 'revenue' ? 'text-[#34C759]' :
                        e.type === 'payment' ? 'text-[#FF3B30]' :
                        'text-[#FF9500]'
                      )}>
                        {e.type === 'revenue' ? '+' : '-'}{e.amount.toLocaleString()}원
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="pb-8" />
    </div>
  )
}

// ─── 결제예정 / 매출예정 탭 ─────────────────────
// 폼 초기 상태 헬퍼
function emptyForm() {
  return {
    projectId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    supplyAmount: '',
    vatAmount: '',
    desc: '',
    counterpart: '',
    vatType: 'not_issued' as 'issued' | 'not_issued',
    // vatIssued 대신 vatType === 'issued' 로 판단
    paymentMethod: 'transfer' as 'transfer' | 'cash',
    // 계좌정보 (결제예정에서 주로 사용)
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  }
}

function CashFlowTab({
  profile,
  flowType,
  currentMonth,
  projects = [],
  selectedProjectId = '',
}: {
  profile: any
  flowType: 'payment' | 'revenue'
  currentMonth: Date
  projects?: { id: string; name: string }[]
  selectedProjectId?: string
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const isPayment = flowType === 'payment'
  const isOwner = profile.role === 'owner'
  const canAdd = isPayment ? true : isOwner

  const color = isPayment ? '#FF3B30' : '#34C759'
  const bgColor = isPayment ? 'bg-[#FF3B30]' : 'bg-[#34C759]'
  const lightBg = isPayment ? 'bg-[#FF3B30]/10' : 'bg-[#34C759]/10'
  const textColor = isPayment ? 'text-[#FF3B30]' : 'text-[#34C759]'
  const borderColor = isPayment ? 'border-[#FF3B30]/20' : 'border-[#34C759]/20'
  const emoji = isPayment ? '📤' : '📥'
  const label = isPayment ? '결제예정' : '매출예정'

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  // 거래처 목록
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, name, process, bank_account, owner_name')
        .eq('company_id', profile.company_id)
        .order('name')
      return data || []
    },
    staleTime: 60000,
  })

  // 폼 상태 (추가 / 수정 공통)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  const setF = (k: keyof ReturnType<typeof emptyForm>, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  // 거래처 선택 시 계좌정보 자동 채우기
  // bank_account: "은행 / 예금주 / 계좌번호" 형식
  const selectVendor = (vendor: any) => {
    setF('counterpart', vendor.name)
    if (vendor.bank_account) {
      const parts = vendor.bank_account.split('/').map((s: string) => s.trim())
      setF('bankName',       parts[0] ?? '')
      setF('accountHolder',  parts[1] ?? vendor.owner_name ?? '')
      setF('accountNumber',  parts[2] ?? '')
    } else if (vendor.owner_name) {
      setF('accountHolder', vendor.owner_name)
    }
    setVendorSearch('')
    setShowVendorDropdown(false)
  }

  // 거래처 검색 필터
  const filteredVendors = vendorSearch.trim()
    ? vendors.filter((v: any) => v.name.includes(vendorSearch) || (v.process ?? '').includes(vendorSearch))
    : vendors

  // 금액 포맷 (숫자만, 콤마)
  const fmtNum = (v: string) => {
    const n = v.replace(/\D/g, '')
    return n ? parseInt(n).toLocaleString() : ''
  }

  // 공급가 입력 시 부가세 자동계산 (vatType='issued'일 때만)
  const handleSupplyChange = (v: string) => {
    const raw = v.replace(/\D/g, '')
    const num = parseInt(raw) || 0
    setForm((p) => ({
      ...p,
      supplyAmount: raw ? num.toLocaleString() : '',
      vatAmount: (p.vatType === 'issued' && raw) ? Math.round(num * 0.1).toLocaleString() : p.vatAmount,
    }))
  }

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (item: any) => {
    setEditingId(item.id)
    setVendorSearch('')
    setShowVendorDropdown(false)
    setForm({
      projectId: item.project_id ?? '',
      date: item.scheduled_date,
      supplyAmount: item.supply_amount ? Number(item.supply_amount).toLocaleString() : Number(item.amount).toLocaleString(),
      vatAmount: item.vat_amount ? Number(item.vat_amount).toLocaleString() : '0',
      desc: item.description,
      counterpart: item.counterpart ?? '',
      vatType: item.vat_type ?? 'not_issued',
      paymentMethod: (item.payment_method === 'cash' ? 'cash' : 'transfer') as 'transfer' | 'cash',
      bankName: item.bank_name ?? '',
      accountHolder: item.account_holder ?? '',
      accountNumber: item.account_number ?? '',
    })
    setShowForm(true)
    // 폼이 상단에 렌더되므로 스크롤 위로 올리기
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); setVendorSearch(''); setShowVendorDropdown(false) }

  // projects join으로 현장명도 함께 조회
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['cash-flow', profile.company_id, flowType, monthStart, monthEnd, selectedProjectId],
    queryFn: async () => {
      let q = supabase
        .from('cash_flow_schedules')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', flowType)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('is_completed', { ascending: true })
        .order('scheduled_date', { ascending: true })
      if (selectedProjectId) q = q.eq('project_id', selectedProjectId)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // ── 이번 달에 완료 처리됐지만 scheduled_date가 다른 달인 항목 (미수금 → 이번달 수금 처리)
  const { data: crossMonthCompleted = [] } = useQuery({
    queryKey: ['cash-flow-cross-completed', profile.company_id, flowType, monthStart, monthEnd, selectedProjectId],
    queryFn: async () => {
      let q = supabase
        .from('cash_flow_schedules')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', flowType)
        .eq('is_completed', true)
        .gte('completed_at', monthStart + 'T00:00:00.000Z')
        .lte('completed_at', monthEnd + 'T23:59:59.999Z')
        // 이번 달 scheduled_date 항목은 items에 이미 포함되므로 제외
        .or(`scheduled_date.lt.${monthStart},scheduled_date.gt.${monthEnd}`)
        .order('completed_at', { ascending: false })
      if (selectedProjectId) q = q.eq('project_id', selectedProjectId)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const supply = parseInt(form.supplyAmount.replace(/,/g, '')) || 0
      // 부가세 미발행(vat_type='not_issued') 시 vat=0으로 저장
      const vatIssued = form.vatType === 'issued'
      const vat    = vatIssued ? (parseInt(form.vatAmount.replace(/,/g, '')) || 0) : 0
      const total  = supply + vat
      if (supply <= 0) throw new Error('금액(공급가)을 입력해주세요')
      if (!form.desc.trim()) throw new Error('내용을 입력해주세요')

      const payload = {
        company_id:      profile.company_id,
        flow_type:       flowType,
        scheduled_date:  form.date,
        supply_amount:   supply,
        vat_amount:      vat,
        amount:          total,
        description:     form.desc.trim(),
        counterpart:     form.counterpart.trim() || null,
        project_id:      form.projectId || null,
        vat_type:        form.vatType,
        // vat_issued 컬럼 없음 — vat_type으로 통일
        payment_method:  form.paymentMethod,
        // 계좌정보
        bank_name:       form.bankName.trim() || null,
        account_holder:  form.accountHolder.trim() || null,
        account_number:  form.accountNumber.trim() || null,
      }

      if (editingId) {
        const { error } = await supabase
          .from('cash_flow_schedules')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('cash_flow_schedules')
          .insert({ ...payload, is_completed: false, created_by: profile.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-overdue', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-cross-completed', profile.company_id, flowType], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['fin-dash-overdue-revenue', profile.company_id] })
      toast.success(editingId ? '수정되었습니다' : '등록되었습니다')
      closeForm()
    },
    onError: (e: any) => toast.error(e.message),
  })

  // ── 완료 처리 → transactions 원장 자동 등록 ──
  const completeMutation = useMutation({
    mutationFn: async (item: any) => {
      // 원장 등록 금액:
      //   매출예정 → 공급가만 (부가세는 매출액 아님)
      //   결제예정 → 공급가만 (부가세는 별도 세금 처리)
      const supply = Number(item.supply_amount) || Number(item.amount)
      const vat    = Number(item.vat_amount)    || 0
      // 화면 표시용(amount)은 supply+vat이지만, 원장에는 공급가만
      const txAmount = supply

      // 1) cash_flow_schedules 완료 표시
      const { error: e1 } = await supabase
        .from('cash_flow_schedules')
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq('id', item.id)
      if (e1) throw e1

      // 2) transactions 원장에 자동 등록
      //    결제예정 → COGS (매출원가), 매출예정 → REVENUE (매출)
      const txCategory = isPayment ? 'COGS' : 'REVENUE'
      const txType     = isPayment ? 'expense' : 'income'
      const txDesc     = item.description +
        (item.counterpart ? ` [${item.counterpart}]` : '')

      const hasVat = vat > 0 || item.vat_type === 'issued'

      const txPayload: any = {
        company_id:            profile.company_id,
        project_id:            item.project_id ?? null,
        category:              txCategory,
        type:                  txType,
        amount:                txAmount,           // 공급가만 (부가세 제외)
        supply_amount:         supply,
        vat_amount:            vat,
        has_vat:               hasVat,
        vat_type:              item.vat_type ?? (hasVat ? 'issued' : null),
        description:           txDesc,
        payment_method:        item.payment_method ?? 'transfer',
        memo:                  `${label} 완료처리 자동등록 | 공급가 ${supply.toLocaleString()}원` +
                               (vat > 0 ? ` | 부가세 ${vat.toLocaleString()}원 (별도)` : '') +
                               ` | 처리: ${profile.name}`,
        transaction_date:      todayStrCF,            // 실제 수금/결제 처리일 = 오늘
        is_site_expense:       isPayment,          // 결제예정만 현장비용
        is_internal_transfer:  false,
        is_voided:             false,
        created_by:            profile.id,
      }

      const { data: txData, error: e2 } = await supabase
        .from('transactions')
        .insert(txPayload)
        .select('id')
        .single()
      if (e2) throw e2

      // 3) transaction_id 연결
      const { error: e3 } = await supabase
        .from('cash_flow_schedules')
        .update({ transaction_id: txData.id })
        .eq('id', item.id)
      if (e3) throw e3
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-overdue', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-cross-completed', profile.company_id, flowType], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['fin-dash-overdue-revenue', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['project-pl'] })
      queryClient.invalidateQueries({ queryKey: ['sga-summary'] })
      toast.success('완료 처리 및 원장에 등록되었습니다')
    },
    onError: (e: any) => toast.error('오류: ' + (e?.message ?? String(e))),
  })

  // ── 완료 복귀 처리 (is_completed → false + 연결 transaction void) ──
  const revertMutation = useMutation({
    mutationFn: async (item: any) => {
      // 1) cash_flow_schedules 원복
      const { error: e1 } = await supabase
        .from('cash_flow_schedules')
        .update({ is_completed: false, completed_at: null, transaction_id: null })
        .eq('id', item.id)
      if (e1) throw e1

      // 2) 연결된 transaction을 void 처리
      if (item.transaction_id) {
        const { error: e2 } = await supabase
          .from('transactions')
          .update({
            is_voided: true,
            void_reason: `${label} 완료 취소 (복귀 처리)`,
          })
          .eq('id', item.transaction_id)
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-overdue', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-cross-completed', profile.company_id, flowType], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['fin-dash-overdue-revenue', profile.company_id] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      queryClient.invalidateQueries({ queryKey: ['ledger-transactions'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['project-pl'] })
      toast.success('완료가 취소되고 원장에서 제거되었습니다')
    },
    onError: (e: any) => toast.error('오류: ' + (e?.message ?? String(e))),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_flow_schedules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-overdue', profile.company_id, flowType] })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-cross-completed', profile.company_id, flowType], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cash-flow-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['fin-dash-overdue-revenue', profile.company_id] })
      toast.success('삭제되었습니다')
    },
  })

  const todayStrCF = format(new Date(), 'yyyy-MM-dd')

  // 오늘이 속한 달의 시작일 (탭 월과 무관하게 오늘 기준)
  const realMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  // 현재 탭이 오늘 달 이상인지 (과거 달 탭에서는 미수금 배너 숨김)
  const isCurrentOrFutureMonth = monthStart >= realMonthStart

  // ── 연체 항목: 오늘 기준 날짜 경과 전체 (미완료) — 현재/미래 탭에서만 표시
  const { data: overdueItems = [] } = useQuery({
    queryKey: ['cash-flow-overdue', profile.company_id, flowType, todayStrCF],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow_schedules')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('flow_type', flowType)
        .eq('is_completed', false)
        .lt('scheduled_date', todayStrCF)   // 오늘 이전 = 날짜 경과 전체
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      return data || []
    },
  })
  const overdueTotal = overdueItems.reduce((s: number, i: any) => s + Number(i.amount), 0)

  const pending   = items.filter((i: any) => !i.is_completed)
  // 완료 목록: 이번달 scheduled_date 완료 항목 + 이번달에 완료 처리된 타달 항목(미수금 → 이번달 수금)
  // completed_at 기준 최신순 정렬
  // items의 완료 항목 중 completed_at이 현재 탭 달 범위 내인 것만 포함
  // (completed_at이 다른 달인 항목은 crossMonthCompleted에서 해당 달 탭에 표시됨)
  const completedFromItems = items.filter((i: any) => {
    if (!i.is_completed) return false
    if (!i.completed_at) return true  // 구 데이터(completed_at 없음) 포함
    return (
      i.completed_at >= monthStart + 'T00:00:00.000Z' &&
      i.completed_at <= monthEnd + 'T23:59:59.999Z'
    )
  })
  const completed = [...completedFromItems, ...crossMonthCompleted]
    .sort((a: any, b: any) => {
      const at = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return bt - at
    })
  const totalPending   = pending.reduce((s: number, i: any) => s + Number(i.amount), 0)
  const totalCompleted = completed.reduce((s: number, i: any) => s + Number(i.supply_amount || i.amount), 0)

  // ── revenue 탭 전용: pending을 날짜 기준으로 미수금 / 수금예정 분리
  // payment 탭은 분리 없이 pending 전체를 결제예정으로 표시
  const pendingOverdue   = !isPayment
    ? pending.filter((i: any) => i.scheduled_date < todayStrCF)
    : []
  const pendingUpcoming  = !isPayment
    ? pending.filter((i: any) => i.scheduled_date >= todayStrCF)
    : pending

  // 미수금 전체 = 이전달 연체(overdueItems) + 이번달 날짜경과(pendingOverdue)
  // id 기준 dedup: 같은 항목이 두 쿼리에서 겹치는 경우 방어
  const allOverdueRaw   = !isPayment ? [...overdueItems, ...pendingOverdue] : []
  const seenIds         = new Set<string>()
  const allOverdue      = allOverdueRaw.filter((i: any) => {
    if (seenIds.has(i.id)) return false
    seenIds.add(i.id)
    return true
  })
  const allOverdueTotal = allOverdue.reduce((s: number, i: any) => s + Number(i.amount), 0)

  // ── 항목 행 렌더러 ──
  const renderItem = (item: any, idx: number, listLen: number, isDone: boolean) => {
    const projectName = item.projects?.name ?? null
    const supply = Number(item.supply_amount) || Number(item.amount)
    const vat    = Number(item.vat_amount) || 0
    // 미완료 항목이면 같은 회사 내 누구나 수정 가능
    // (created_by가 null인 구 데이터도 포함, 완료된 항목은 편집 불가)
    const canEdit   = !isDone
    // 복귀/삭제: owner이면 무조건 가능, 아니면 등록자만
    // 상태 배지: 3단계
    //  미완료 + 날짜 지난 경우 → 미수금⚠️ / 미결제⚠️
    //  미완료 + 날짜 안지난 경우 → 예정
    //  완료 → 수금완료✅ / 결제완료✅
    const isOverdue = !isDone && !isPayment && item.scheduled_date < todayStrCF
    const statusBadge = isDone
      ? { text: isPayment ? '결제완료✅' : '수금완료✅', cls: 'text-[#34C759] bg-[#34C759]/10' }
      : isOverdue
        ? { text: '미수금⚠️', cls: 'text-[#FF3B30] bg-[#FF3B30]/10' }
        : { text: '예정', cls: 'text-[#8E8E93] bg-[#F2F2F7]' }
    const canManage = item.created_by === profile.id || isOwner
    return (
      <div
        key={item.id}
        className={cn('px-4 py-3.5', idx < listLen - 1 && 'border-b border-black/5')}
      >
        {/* ── 상태 뱃지 (3단계) ── */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={cn('text-[11px] md:text-[13px] font-semibold px-2 md:px-3 py-0.5 rounded-full', statusBadge.cls)}>
            {statusBadge.text}
          </span>
          {isDone && item.transaction_id && (
            <span className="text-[10px] md:text-[12px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full">
              원장 등록됨
            </span>
          )}
        </div>

        {/* 상단 뱃지 행 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          {projectName && (
            <span className="text-[11px] md:text-[12px] font-semibold text-[#34C759] bg-[#34C759]/10 px-2 py-0.5 rounded-full">
              📍 {projectName}
            </span>
          )}
          {item.counterpart && (
            <span className="text-[11px] md:text-[12px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full">
              🏢 {item.counterpart}
            </span>
          )}
          <span className={cn(
            'text-[10px] md:text-[12px] px-2 py-0.5 rounded-full font-medium',
            item.vat_type === 'issued'
              ? 'bg-[#007AFF]/10 text-[#007AFF]'
              : 'bg-[#8E8E93]/10 text-[#8E8E93]'
          )}>
            {item.vat_type === 'issued' ? '계산서발행' : '계산서미발행'}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          {/* 왼쪽: 내용 + 날짜 + 금액 상세 */}
          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-[14px] md:text-[16px] font-semibold',
              isDone ? 'text-[#3C3C43]' : 'text-[#1C1C1E]',
            )}>
              {item.description}
            </p>
            <p className="text-[11px] md:text-[13px] text-[#8E8E93] mt-0.5">
              {isDone && item.completed_at
                ? `✓ ${new Date(item.completed_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 완료`
                : item.scheduled_date
              }
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] md:text-[13px] text-[#3C3C43]">
                공급가 <span className="font-semibold">{supply.toLocaleString()}원</span>
              </span>
              {vat > 0 && (
                <span className="text-[11px] md:text-[13px] text-[#8E8E93]">
                  + 부가세 {vat.toLocaleString()}원
                </span>
              )}
            </div>
            {/* 결제방법 뱃지 */}
            <div className="mt-1.5 flex items-center gap-1.5">
              {item.payment_method === 'cash' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF9500]/12 text-[#FF9500] text-[10px] md:text-[12px] font-semibold">
                  💵 현금
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] text-[10px] md:text-[12px] font-semibold">
                  🏦 계좌이체
                </span>
              )}
            </div>
            {/* 계좌정보 (등록된 경우만 표시) */}
            {(item.bank_name || item.account_number) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {item.bank_name && (
                  <span className="text-[11px] md:text-[14px] text-[#3C3C43] font-semibold">{item.bank_name}</span>
                )}
                {item.account_holder && (
                  <span className="text-[11px] md:text-[13px] text-[#8E8E93]">{item.account_holder}</span>
                )}
                {item.account_number && (
                  <span className="text-[12px] md:text-[15px] text-[#1C1C1E] font-mono font-bold tracking-wide">{item.account_number}</span>
                )}
                {item.account_number && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(item.account_number)
                        .then(() => toast.success('계좌번호가 복사되었습니다'))
                        .catch(() => toast.error('복사에 실패했습니다'))
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-[#007AFF]/10 text-[#007AFF] rounded-md text-[10px] md:text-[12px] font-semibold"
                    title="계좌번호 복사"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                      <path d="M3 8H2.5A1.5 1.5 0 0 1 1 6.5v-5A1.5 1.5 0 0 1 2.5 0h5A1.5 1.5 0 0 1 9 1.5V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    복사
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 오른쪽: 합계 + 버튼 */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {/* 미완료: 합계(공급가+부가세) 표시 / 완료: 원장 등록액(공급가)만 표시 */}
            {!isDone ? (
              <p className={cn('text-[16px] md:text-[18px] font-bold', textColor)}>
                {isPayment ? '-' : '+'}{Number(item.amount).toLocaleString()}원
              </p>
            ) : (
              <div className="text-right">
                <p className="text-[16px] md:text-[18px] font-bold text-[#34C759]">
                  {isPayment ? '-' : '+'}{supply.toLocaleString()}원
                </p>
                {vat > 0 && (
                  <p className="text-[11px] md:text-[12px] text-[#8E8E93] mt-0.5">
                    부가세 {vat.toLocaleString()}원 포함
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {/* 수정 버튼 (미완료 + 권한 있을 때) */}
              {canEdit && (
                <button
                  onClick={() => openEdit(item)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[#007AFF]/10 text-[#007AFF]"
                  title="수정"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {/* 완료 버튼 (미완료 항목에만) */}
              {!isDone && (
                <button
                  onClick={() => {
                    if (confirm(`완료 처리 시 원장에 자동 등록됩니다.\n계속할까요?`)) {
                      completeMutation.mutate(item)
                    }
                  }}
                  disabled={completeMutation.isPending}
                  className={cn('w-7 h-7 rounded-full flex items-center justify-center', lightBg, textColor)}
                  title="완료 처리 (원장 자동 등록)"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {/* 복귀 버튼 (완료 항목 + 권한 있을 때) — 항상 선명하게 표시 */}
              {isDone && canManage && (
                <button
                  onClick={() => {
                    if (confirm(`완료를 취소하고 예정 목록으로 복귀합니다.\n원장에 등록된 거래도 취소됩니다.\n계속할까요?`)) {
                      revertMutation.mutate(item)
                    }
                  }}
                  disabled={revertMutation.isPending}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/30"
                  title="완료 취소 (복귀)"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 5H9C10.66 5 12 6.34 12 8C12 9.66 10.66 11 9 11H5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4.5 2.5L2 5L4.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {/* 삭제 버튼 (완료 항목에선 숨김 — 복귀 후 삭제하도록) */}
              {!isDone && canManage && (
                <button
                  onClick={() => { if (confirm('삭제할까요?')) deleteMutation.mutate(item.id) }}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[#FF3B30]/10 text-[#FF3B30]"
                  title="삭제"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 등록/수정 폼 ──
  const renderForm = () => (
    <div className={cn('ios-card p-4 space-y-3 border', borderColor)}>
      <p className="text-[14px] font-bold text-[#1C1C1E]">
        {editingId ? '✏️ 수정' : `+ ${label} 추가`}
      </p>

      {/* 1. 현장 선택 (맨 위) */}
      <div>
        <label className="text-[11px] text-[#8E8E93] font-medium mb-1 block">현장</label>
        <select
          value={form.projectId}
          onChange={(e) => setF('projectId', e.target.value)}
          className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none appearance-none"
        >
          <option value="">📍 현장 선택 (선택)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 2. 날짜 */}
      <div>
        <label className="text-[11px] text-[#8E8E93] font-medium mb-1 block">날짜</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setF('date', e.target.value)}
          className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
        />
      </div>

      {/* 3. 공급가 */}
      <div>
        <label className="text-[11px] text-[#8E8E93] font-medium mb-1 block">공급가액</label>
        <div className="relative">
          <input
            type="text" inputMode="numeric"
            value={form.supplyAmount}
            onChange={(e) => handleSupplyChange(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[16px] font-bold outline-none pr-8"
            style={{ color }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
        </div>
      </div>

      {/* 4. 부가세 + 발행 여부 체크박스 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-[#8E8E93] font-medium">
            부가세 <span className="text-[10px] text-[#C7C7CC]">(10% 자동계산)</span>
          </label>
          {/* 부가세 발행 여부 체크박스 — vat_type 컬럼 기반 */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.vatType === 'issued'}
              onChange={(e) => {
                const checked = e.target.checked
                const supply = parseInt(form.supplyAmount.replace(/,/g, '')) || 0
                setForm((p) => ({
                  ...p,
                  vatType: checked ? 'issued' : 'not_issued',
                  vatAmount: checked
                    ? supply > 0
                        ? Math.round(supply * 0.1).toLocaleString()
                        : p.vatAmount
                    : '0',
                }))
              }}
              className="w-4 h-4 rounded accent-[#007AFF]"
            />
            <span className="text-[12px] font-semibold text-[#007AFF]">부가세 발행</span>
          </label>
        </div>
        <div className="relative">
          <input
            type="text" inputMode="numeric"
            value={form.vatType === 'issued' ? form.vatAmount : '0 (미발행)'}
            onChange={(e) => { if (form.vatType === 'issued') setForm((p) => ({ ...p, vatAmount: fmtNum(e.target.value) })) }}
            disabled={form.vatType !== 'issued'}
            placeholder="0"
            className={cn(
              'w-full px-3 py-2.5 rounded-xl text-[14px] outline-none pr-8',
              form.vatType === 'issued' ? 'bg-[#F2F2F7]' : 'bg-[#F2F2F7]/50 text-[#C7C7CC] cursor-not-allowed'
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8E93]">원</span>
        </div>
        {(parseInt(form.supplyAmount.replace(/,/g, '')) || 0) > 0 && (
          <p className="text-[11px] text-[#8E8E93] mt-1">
            합계:{' '}
            <span className="font-bold" style={{ color }}>
              {(
                (parseInt(form.supplyAmount.replace(/,/g, '')) || 0) +
                (form.vatType === 'issued' ? (parseInt(form.vatAmount.replace(/,/g, '')) || 0) : 0)
              ).toLocaleString()}원
            </span>
            {form.vatType !== 'issued' && <span className="text-[10px] text-[#C7C7CC] ml-1">(부가세 미포함)</span>}
          </p>
        )}
      </div>

      {/* 5. 내용 */}
      <div>
        <label className="text-[11px] text-[#8E8E93] font-medium mb-1 block">내용</label>
        <input
          type="text"
          value={form.desc}
          onChange={(e) => setF('desc', e.target.value)}
          placeholder={isPayment ? '자재비, 외주비 등' : '공사대금 청구, 계약금 등'}
          className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
        />
      </div>

      {/* 6. 거래처명 — 등록 거래처 선택 or 직접 입력 */}
      <div>
        <label className="text-[11px] text-[#8E8E93] font-medium mb-1 block">거래처명</label>

        {/* 거래처 선택 팝업 */}
        {showVendorDropdown && (
          <>
            {/* 배경 오버레이 */}
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => {
                if (!form.counterpart && vendorSearch.trim()) setF('counterpart', vendorSearch.trim())
                setShowVendorDropdown(false)
              }}
            />
            {/* 팝업 박스 */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(480px,90vw)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '60vh' }}>
              {/* 헤더 */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-black/8 flex-shrink-0">
                <p className="flex-1 text-[15px] font-bold text-black">거래처 선택</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.counterpart && vendorSearch.trim()) setF('counterpart', vendorSearch.trim())
                    setShowVendorDropdown(false)
                  }}
                  className="text-[#8E8E93] text-[20px] leading-none"
                >×</button>
              </div>

              {/* 검색창 */}
              <div className="px-3 py-2 border-b border-black/5 flex-shrink-0">
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  autoFocus
                  placeholder="거래처명 또는 공정 검색..."
                  className="w-full px-3 py-2 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
                />
              </div>

              {/* 목록 */}
              <div className="overflow-y-auto flex-1">
                {/* 직접 입력 */}
                {vendorSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setF('counterpart', vendorSearch.trim())
                      setVendorSearch('')
                      setShowVendorDropdown(false)
                    }}
                    className="w-full px-4 py-3 text-left border-b border-black/5 bg-[#007AFF]/5 active:bg-[#007AFF]/10"
                  >
                    <p className="text-[13px] text-[#007AFF] font-medium">✏️ "{vendorSearch.trim()}" 직접 입력</p>
                  </button>
                )}

                {filteredVendors.length === 0 && !vendorSearch.trim() ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[13px] text-[#8E8E93]">등록된 거래처가 없습니다</p>
                  </div>
                ) : (
                  filteredVendors.map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectVendor(v)}
                      className="w-full px-4 py-3 text-left border-b border-black/5 last:border-0 active:bg-[#F2F2F7]"
                    >
                      <p className="text-[13px] font-semibold text-black">{v.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {v.process && <span className="text-[11px] text-[#8E8E93]">{v.process}</span>}
                        {v.bank_account
                          ? (() => {
                              const parts = v.bank_account.split('/').map((s: string) => s.trim())
                              return <span className="text-[11px] text-[#007AFF]">🏦 {[parts[0], parts[1], parts[2]].filter(Boolean).join(' · ')}</span>
                            })()
                          : <span className="text-[11px] text-[#C7C7CC]">계좌정보 없음</span>
                        }
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* 선택 버튼 */}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => { setShowVendorDropdown(true); setVendorSearch('') }}
            className={cn(
              'flex-1 px-3 py-2.5 rounded-xl text-[14px] text-left outline-none',
              form.counterpart ? 'bg-[#34C759]/10 text-black font-medium' : 'bg-[#F2F2F7] text-[#C7C7CC]'
            )}
          >
            {form.counterpart || '거래처 검색 또는 직접 입력'}
          </button>
          {form.counterpart && (
            <button
              type="button"
              onClick={() => {
                setF('counterpart', '')
                setF('bankName', '')
                setF('accountHolder', '')
                setF('accountNumber', '')
              }}
              className="text-[#8E8E93] text-[20px] leading-none px-1 flex-shrink-0"
            >×</button>
          )}
        </div>
      </div>

      {/* 7. 결제방법 */}
      <div className="space-y-2">
        <label className="text-[11px] text-[#8E8E93] font-medium block">💳 결제방법</label>
        <div className="flex gap-2">
          {(['transfer', 'cash'] as const).map((method) => {
            const isSelected = form.paymentMethod === method
            const label = method === 'transfer' ? '계좌이체' : '현금'
            const icon  = method === 'transfer' ? '🏦' : '💵'
            return (
              <button
                key={method}
                type="button"
                onClick={() => setF('paymentMethod', method)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[14px] font-semibold transition-colors',
                  isSelected
                    ? 'bg-[#007AFF] border-[#007AFF] text-white'
                    : 'bg-[#F2F2F7] border-transparent text-[#8E8E93]'
                )}
              >
                <span>{icon}</span>
                <span>{label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6.5" stroke="white" strokeWidth="1.2"/>
                    <path d="M4 7l2.2 2.2L10 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 8. 계좌정보 - 결제예정에서 주로 사용 */}
      <div className="space-y-2">
        <label className="text-[11px] text-[#8E8E93] font-medium block">
          🏦 계좌정보 <span className="text-[10px] text-[#C7C7CC]">(선택)</span>
        </label>
        {/* 은행 + 예금주 (나란히) */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={form.bankName}
              onChange={(e) => setF('bankName', e.target.value)}
              placeholder="은행 (예: 국민은행)"
              className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={form.accountHolder}
              onChange={(e) => setF('accountHolder', e.target.value)}
              placeholder="예금주"
              className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
            />
          </div>
        </div>
        {/* 계좌번호 + 복사 버튼 */}
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={form.accountNumber}
            onChange={(e) => {
              // 숫자와 하이픈만 허용
              const v = e.target.value.replace(/[^0-9\-]/g, '')
              setF('accountNumber', v)
            }}
            placeholder="계좌번호 (숫자만 입력)"
            className="flex-1 px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] outline-none"
          />
          {form.accountNumber && (
            <button
              type="button"
              onClick={() => {
                copyToClipboard(form.accountNumber)
                  .then(() => toast.success('계좌번호가 복사되었습니다'))
                  .catch(() => toast.error('복사에 실패했습니다'))
              }}
              className="flex items-center gap-1 px-3 py-2.5 bg-[#007AFF]/10 text-[#007AFF] rounded-xl text-[12px] font-semibold flex-shrink-0 whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M3 8H2.5A1.5 1.5 0 0 1 1 6.5v-5A1.5 1.5 0 0 1 2.5 0h5A1.5 1.5 0 0 1 9 1.5V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              복사
            </button>
          )}
        </div>
      </div>

      {/* 8. 세금계산서 발행 여부 — vatIssued 체크박스와 통합 (부가세 섹션에서 처리) */}

      {/* 저장/취소 버튼 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={closeForm}
          className="flex-1 py-3 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[14px] font-semibold"
        >
          취소
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className={cn('flex-1 py-3 rounded-xl text-white text-[14px] font-bold disabled:opacity-50', bgColor)}
        >
          {saveMutation.isPending ? '저장 중...' : (editingId ? '수정 저장' : '저장')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4 space-y-4">

      {/* ── 헤더 합계 카드: 좌(예정) / 우(완료) 2분할 ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      >
        <div className="flex">
          {/* 좌측: 예정 */}
          <div
            className="flex-1 p-4"
            style={{ background: isPayment ? '#FF3B30' : '#34C759' }}
          >
            <p className="text-white/80 text-[11px] font-medium">{emoji} {label} 예정</p>
            <p className="text-white text-[22px] font-bold mt-0.5 leading-tight">
              {isPayment ? '-' : '+'}{totalPending.toLocaleString()}
              <span className="text-[13px] font-normal ml-0.5">원</span>
            </p>
            <p className="text-white/70 text-[11px] mt-1">{pending.length}건 미완료</p>
          </div>
          {/* 구분선 */}
          <div className="w-px bg-white/20" />
          {/* 우측: 완료 */}
          <div
            className="flex-1 p-4"
            style={{ background: isPayment ? '#C0392B' : '#27AE60' }}
          >
            <p className="text-white/80 text-[11px] font-medium">
              ✅ {isPayment ? '결제완료' : '수금완료'}
            </p>
            <p className="text-white text-[22px] font-bold mt-0.5 leading-tight">
              {isPayment ? '-' : '+'}{totalCompleted.toLocaleString()}
              <span className="text-[13px] font-normal ml-0.5">원</span>
            </p>
            <p className="text-white/70 text-[11px] mt-1">{completed.length}건 완료</p>
          </div>
        </div>
      </div>

      {/* ── 추가 버튼 ── */}
      {canAdd && !showForm && (
        <button
          onClick={openAdd}
          className={cn('w-full py-3 rounded-2xl text-[15px] font-bold', bgColor, 'text-white')}
        >
          + {label} 추가
        </button>
      )}

      {/* ── 등록/수정 폼 ── */}
      {showForm && renderForm()}

      {/* ── 미수금 배너 (revenue 탭 전용 · 현재달 이상에서만 표시) ── */}
      {!isPayment && isCurrentOrFutureMonth && allOverdue.length > 0 && (
        <div className="rounded-2xl overflow-hidden border-2 border-[#FF3B30]/40">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#FF3B30]">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-white">
                ⚠️ 미수금 {allOverdue.length}건
              </span>
              <span className="text-[11px] text-white/80">날짜 경과 · 미수금</span>
            </div>
            <span className="text-[15px] font-bold text-white">
              +{allOverdueTotal.toLocaleString()}원
            </span>
          </div>
          {/* 항목 목록 */}
          <div className="bg-[#FFF5F5] divide-y divide-[#FF3B30]/10">
            {allOverdue.map((item: any) => {
              const mm = item.scheduled_date ? item.scheduled_date.slice(0,7).replace('-','/') : '-'
              const dd = item.scheduled_date ? item.scheduled_date.slice(5).replace('-','/') : '-'
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-shrink-0 text-center w-[38px]">
                    <p className="text-[10px] text-[#FF3B30]/60 font-medium leading-tight">{mm}</p>
                    <p className="text-[13px] font-bold text-[#FF3B30]">{dd}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1C1C1E] truncate">{item.description}</p>
                    {(item.counterpart || item.projects?.name) && (
                      <p className="text-[11px] text-[#8E8E93] truncate">
                        {item.counterpart}{item.projects?.name ? ` · ${item.projects.name}` : ''}
                      </p>
                    )}
                  </div>
                  <p className="text-[14px] font-bold text-[#FF3B30] flex-shrink-0">
                    +{Number(item.amount).toLocaleString()}원
                  </p>
                  {/* 수금완료 버튼 */}
                  <button
                    onClick={() => completeMutation.mutate(item)}
                    disabled={completeMutation.isPending}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#34C759] text-white text-[11px] font-bold active:opacity-70 disabled:opacity-40"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    수금
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 항목 목록 ── */}
      {isLoading ? (
        <div className="text-center py-8 text-[#8E8E93] text-[14px]">불러오는 중...</div>
      ) : (
        <>
          {/* ── PC: 현장별 3열 그리드 ── */}
          <div className="hidden md:block">
            {(() => {
              // revenue: 수금예정(pendingUpcoming)만 그리드에 표시 / payment: pending 전체
              const upcomingItems = isPayment ? pending : pendingUpcoming
              const grouped: Record<string, { projectName: string; items: any[] }> = {}
              ;[...upcomingItems, ...completed].forEach((item: any) => {
                const pid   = item.project_id ?? '__none__'
                const pname = item.projects?.name ?? '현장 미지정'
                if (!grouped[pid]) grouped[pid] = { projectName: pname, items: [] }
                grouped[pid].items.push(item)
              })
              const groups = Object.entries(grouped)
              const emptyLabel = isPayment ? '이번달 결제예정 없음' : '수금예정 없음'
              if (groups.length === 0) return (
                <div className="text-center py-10">
                  <p className="text-[36px] mb-2">{emoji}</p>
                  <p className="text-[15px] font-semibold text-[#1C1C1E]">{emptyLabel}</p>
                  {canAdd && isPayment && <p className="text-[13px] text-[#8E8E93] mt-1">위 버튼으로 추가하거나<br />현장 편집 {'>'} 공사대금 결제일에서 등록하세요</p>}
                </div>
              )
              return (
                <div className="grid grid-cols-3 gap-4">
                  {groups.map(([pid, group]) => {
                    const groupPending   = group.items.filter((i: any) => !i.is_completed)
                    const groupCompleted = group.items.filter((i: any) => i.is_completed)
                    const groupTotal     = group.items.reduce((s: number, i: any) => s + Number(i.supply_amount || i.amount), 0)
                    return (
                      <div key={pid} className="ios-card overflow-hidden">
                        {/* 현장명 헤더 */}
                        <div className={cn('px-4 py-4 border-b border-black/5', isPayment ? 'bg-[#FF3B30]/5' : 'bg-[#34C759]/5')}>
                          <p className="text-[16px] font-bold text-black truncate mb-1">{group.projectName}</p>
                          <span className={cn('text-[20px] font-bold', textColor)}>
                            {isPayment ? '-' : '+'}{groupTotal.toLocaleString()}원
                          </span>
                        </div>
                        {/* 예정(미완료) 항목 */}
                        {groupPending.map((item: any, idx: number) => renderItem(item, idx, groupPending.length, false))}
                        {/* 완료 항목 구분선 + 목록 */}
                        {groupCompleted.length > 0 && (
                          <>
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#34C759]/15 border-t-2 border-[#34C759]">
                              <div className="flex-1 h-[2px] bg-[#34C759]/60" />
                              <div className="flex items-center gap-1.5">
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <p className="text-[12px] font-semibold text-[#34C759]">{isPayment ? '결제완료' : '수금완료'} {groupCompleted.length}건</p>
                              </div>
                              <div className="flex-1 h-[2px] bg-[#34C759]/60" />
                            </div>
                            {groupCompleted.map((item: any, idx: number) => renderItem(item, idx, groupCompleted.length, true))}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* ── 모바일 목록 ── */}
          <div className="md:hidden">
            {/* revenue 탭: 수금예정 섹션 */}
            {!isPayment && (
              <>
                {pendingUpcoming.length === 0 && completed.length === 0 && allOverdue.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-[36px] mb-2">{emoji}</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">이번달 {label} 없음</p>
                    {canAdd && <p className="text-[13px] text-[#8E8E93] mt-1">위 버튼으로 추가하세요</p>}
                  </div>
                )}
                {pendingUpcoming.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-px bg-black/8" />
                      <p className="text-[11px] font-medium text-[#34C759]">수금예정 {pendingUpcoming.length}건</p>
                      <div className="flex-1 h-px bg-black/8" />
                    </div>
                    <div className="ios-card overflow-hidden">
                      {pendingUpcoming.map((item: any, idx: number) => renderItem(item, idx, pendingUpcoming.length, false))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* payment 탭: 결제예정 전체 */}
            {isPayment && (
              <>
                {pending.length === 0 && completed.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-[36px] mb-2">{emoji}</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">이번달 {label} 없음</p>
                    {canAdd && <p className="text-[13px] text-[#8E8E93] mt-1">위 버튼으로 추가하세요</p>}
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="ios-card overflow-hidden">
                    {pending.map((item: any, idx: number) => renderItem(item, idx, pending.length, false))}
                  </div>
                )}
              </>
            )}

            {/* 완료 섹션 (공통) */}
            {completed.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2 py-2 px-3 rounded-xl bg-[#34C759]/15 border-2 border-[#34C759]">
                  <div className="flex-1 h-[2px] bg-[#34C759]/60" />
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="text-[12px] font-semibold text-[#34C759]">{isPayment ? '결제완료' : '수금완료'} {completed.length}건</p>
                  </div>
                  <div className="flex-1 h-[2px] bg-[#34C759]/60" />
                </div>
                <div className="rounded-2xl overflow-hidden border-2 border-[#34C759] bg-white">
                  {completed.map((item: any, idx: number) => renderItem(item, idx, completed.length, true))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="pb-8" />
    </div>
  )
}
