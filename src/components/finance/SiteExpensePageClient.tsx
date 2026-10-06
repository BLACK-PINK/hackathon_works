'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { Plus, ChevronDown } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const schema = z.object({
  project_id: z.string().optional(),
  cash_account_id: z.string().optional(),
  description: z.string().min(1, '내용을 입력해주세요'),
  amount: z.string().min(1, '금액을 입력해주세요'),
  transaction_date: z.string().min(1),
  memo: z.string().optional(),
  payment_method: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
})

type FormData = z.infer<typeof schema>

interface SiteExpensePageClientProps {
  profile: any
}

// ─── 사람별 시재 카드 ───────────────────────
function PersonCard({ member, profile }: { member: any; profile: any }) {
  const supabase = createClient()
  const LIMIT = 10
  const [expanded, setExpanded] = useState(false)

  const { data: account } = useQuery({
    queryKey: ['cash-account-member', member.id, profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_accounts')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('user_id', member.id)
        .single()
      return data
    },
  })

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['site-expenses-member', member.id, profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, project:projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('is_site_expense', true)
        .eq('created_by', member.id)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: false })
        .limit(50)
      return data || []
    },
    staleTime: 0,
  })

  const isMe = member.id === profile.id
  const total = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayTotal = expenses
    .filter((e: any) => e.transaction_date === todayStr)
    .reduce((s: number, e: any) => s + Number(e.amount), 0)

  const displayed = expanded ? expenses : expenses.slice(0, LIMIT)
  const hasMore = expenses.length > LIMIT

  return (
    <div className={cn('ios-card overflow-hidden', isMe && 'border border-[#007AFF]/20')}>
      {/* 헤더 */}
      <div className={cn('px-4 py-3 border-b border-black/5', isMe ? 'bg-[#007AFF]/5' : 'bg-[#F9F9FB]')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', isMe ? 'bg-[#007AFF]' : 'bg-[#8E8E93]/20')}>
              <span className={cn('text-[14px] font-bold', isMe ? 'text-white' : 'text-[#3C3C43]')}>{member.name?.charAt(0) || '?'}</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-black">{member.name} {isMe && <span className="text-[11px] text-[#007AFF] font-normal">나</span>}</p>
              <p className="text-[11px] text-[#8E8E93]">{member.position || member.role || ''}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#8E8E93]">시재 잔액</p>
            <p className="text-[15px] font-bold text-[#1C1C1E]">
              {account ? Number(account.current_balance).toLocaleString() : '0'}원
            </p>
          </div>
        </div>
        {/* 요약 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/60 rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] text-[#8E8E93]">오늘 지출</p>
            <p className="text-[13px] font-bold text-[#FF3B30]">{todayTotal.toLocaleString()}원</p>
          </div>
          <div className="bg-white/60 rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] text-[#8E8E93]">총 지출 ({expenses.length}건)</p>
            <p className="text-[13px] font-bold text-[#FF9500]">{total.toLocaleString()}원</p>
          </div>
        </div>
      </div>

      {/* 경비 목록 */}
      <div>
        {isLoading ? (
          <div className="px-4 py-4 text-center text-[13px] text-[#8E8E93]">불러오는 중...</div>
        ) : expenses.length === 0 ? (
          <div className="px-4 py-4 text-center text-[13px] text-[#C7C7CC]">등록된 경비 없음</div>
        ) : (
          <>
            {displayed.map((e: any, i: number) => (
              <div key={e.id} className={cn('flex items-center gap-2 px-4 py-2.5', i < displayed.length - 1 && 'border-b border-black/4')}>
                <span className="text-[11px] text-[#8E8E93] flex-shrink-0 w-10">
                  {e.transaction_date ? e.transaction_date.slice(5).replace('-', '/') : '-'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black truncate">{e.description}</p>
                  {e.project?.name && (
                    <p className="text-[10px] text-[#8E8E93] truncate">{e.project.name}</p>
                  )}
                </div>
                <p className="text-[13px] font-bold text-[#FF3B30] flex-shrink-0">
                  -{Number(e.amount).toLocaleString()}원
                </p>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full py-2.5 text-[13px] font-semibold text-[#007AFF] bg-[#007AFF]/5 flex items-center justify-center gap-1"
              >
                <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
                {expanded ? '접기' : `더보기 (${expenses.length - LIMIT}건)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function SiteExpensePageClient({ profile }: SiteExpensePageClientProps) {
  const [showForm, setShowForm] = useState(false)
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 내 시재 계좌
  const { data: myAccount } = useQuery({
    queryKey: ['my-cash-account', profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_accounts')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('user_id', profile.id)
        .single()
      return data
    },
  })

  // 현장 목록
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple', profile.company_id],
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

  // 회사 멤버 목록 (시재 카드 표시용)
  const { data: members = [] } = useQuery({
    queryKey: ['site-expense-members', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, position, role')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name')
      return data || []
    },
  })

  // 내 현장 경비 (오늘 소계용)
  const { data: myExpenses = [] } = useQuery({
    queryKey: ['my-site-expenses', profile.company_id, profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, project:projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('is_site_expense', true)
        .eq('created_by', profile.id)
        .eq('is_voided', false)
        .order('transaction_date', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_date: format(new Date(), 'yyyy-MM-dd'),
    },
  })

  const addExpense = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from('transactions').insert({
        company_id: profile.company_id,
        project_id: data.project_id || null,
        cash_account_id: myAccount?.id || null,
        category: 'COGS',
        sub_category: '현장경비',
        type: 'expense',
        amount: parseFloat(data.amount),
        description: data.description,
        memo: data.memo || null,
        transaction_date: data.transaction_date,
        is_site_expense: true,
        payment_method: data.payment_method || null,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('현장 경비가 등록되었습니다')
      queryClient.invalidateQueries({ queryKey: ['my-site-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['site-expenses-member', profile.id] })
      queryClient.invalidateQueries({ queryKey: ['my-cash-account'] })
      reset({ transaction_date: format(new Date(), 'yyyy-MM-dd') })
      setShowForm(false)
    },
    onError: () => toast.error('등록에 실패했습니다'),
  })

  const totalToday = myExpenses
    .filter((e: any) => e.transaction_date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((s: number, e: any) => s + Number(e.amount), 0)

  // 나를 맨 앞으로 정렬
  const sortedMembers = [...members].sort((a: any, b: any) => {
    if (a.id === profile.id) return -1
    if (b.id === profile.id) return 1
    return 0
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="현장 경비 (시재)"
        subtitle={myAccount ? `내 시재: ${Number(myAccount.current_balance).toLocaleString()}원` : undefined}
        action={
          <button
            onClick={() => setShowForm(true)}
            className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-safe">
        {/* 오늘 내 소계 */}
        <div className="mx-4 mt-4 ios-card p-4 bg-[#FF9500]">
          <p className="text-white/80 text-[12px] font-medium">오늘 내 현장 경비</p>
          <p className="text-white text-[26px] font-bold">
            {totalToday.toLocaleString()}
            <span className="text-[14px] font-normal ml-1">원</span>
          </p>
        </div>

        {/* 입력 폼 */}
        {showForm && (
          <div className="mx-4 mt-4 ios-card p-4 animate-fade-in-up">
            <p className="text-[15px] font-semibold text-black mb-3">현장 경비 입력</p>
            <form onSubmit={handleSubmit((d) => addExpense.mutate(d))} className="space-y-3">
              <select {...register('project_id')} className="ios-input">
                <option value="">현장 선택 (선택)</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div>
                <input {...register('description')} type="text" placeholder="경비 내용 *" className="ios-input" />
                {errors.description && <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.description.message}</p>}
              </div>
              <div>
                <input {...register('amount', { valueAsNumber: true })} type="number" placeholder="금액 *" inputMode="numeric" className="ios-input" />
                {errors.amount && <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.amount.message}</p>}
              </div>
              <input {...register('transaction_date')} type="date" className="ios-input" />
              <select {...register('payment_method')} className="ios-input">
                <option value="">결제 방법 (선택)</option>
                <option value="cash">현금</option>
                <option value="card">카드</option>
                <option value="transfer">계좌이체</option>
                <option value="other">기타</option>
              </select>
              <textarea {...register('memo')} placeholder="메모 (선택)" rows={2} className="ios-input resize-none" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 h-11 border border-[#C7C7CC] rounded-xl text-[14px] font-medium text-[#8E8E93] active:opacity-60">취소</button>
                <button type="submit" disabled={addExpense.isPending} className="flex-1 h-11 bg-[#007AFF] rounded-xl text-[14px] font-semibold text-white active:opacity-70">
                  {addExpense.isPending ? '등록중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 사람별 카드 그리드 (모바일: 1열 / PC: 3열) */}
        <div className="px-4 mt-4 pb-4">
          <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide mb-3">
            팀원별 시재 현황 ({sortedMembers.length}명)
          </p>
          {sortedMembers.length === 0 ? (
            <div className="ios-card p-8 text-center">
              <p className="text-[32px] mb-2">👥</p>
              <p className="text-[14px] text-[#8E8E93]">팀원이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {sortedMembers.map((member: any) => (
                <PersonCard key={member.id} member={member} profile={profile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
