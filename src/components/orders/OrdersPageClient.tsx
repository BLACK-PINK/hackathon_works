'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, MessageCircle, Clock, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_PRIORITY_LABELS } from '@/types'
import { formatDistanceToNow, differenceInDays, format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AddOrderSheet } from '@/components/orders/AddOrderSheet'
import { OrderDetailSheet } from '@/components/orders/OrderDetailSheet'

type FilterType = 'all' | 'sent' | 'received' | 'done'

interface OrdersPageClientProps {
  profile: any
}

const statusColors: Record<string, string> = {
  unconfirmed: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  in_progress: 'bg-[#FF9500]/10 text-[#FF9500]',
  completed: 'bg-[#34C759]/10 text-[#34C759]',
  on_hold: 'bg-[#8E8E93]/10 text-[#8E8E93]',
}

const priorityColors: Record<string, string> = {
  urgent: 'text-[#FF3B30]',
  high: 'text-[#FF9500]',
  normal: 'text-[#007AFF]',
  low: 'text-[#8E8E93]',
}

export function OrdersPageClient({ profile }: OrdersPageClientProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const supabase = createClient()
  const queryClient = useQueryClient()

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
  const isCurrentMonth = format(currentMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  // ── 업무전달 목록 조회 (FK 조인 없이 안전하게) ──
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['work-orders', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`*, project:projects(id, name)`)
        .eq('company_id', profile.company_id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd + 'T23:59:59')
        .order('created_at', { ascending: false })
      if (error) { console.error('[work_orders error]', error); throw error }
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  // ── 멤버 목록 (이름 조회용, is_active 조건 없이 전체 조회) ──
  const { data: members = [] } = useQuery({
    queryKey: ['members-all-no-filter', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .order('name')
      if (error) console.error('[members query error]', error)
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const getMemberName = (id: string | null) => {
    if (!id) return null
    return members.find((m: any) => m.id === id)?.name || null
  }

  // order에서 직접 이름 꺼내기 (JOIN 데이터)
  const getOrderNames = (order: any) => ({
    creatorName: order.creator?.name || getMemberName(order.created_by) || '알 수 없음',
    assigneeName: order.assignee?.name || getMemberName(order.assigned_to) || '미지정',
  })

  const refresh = () => {
    refetch()
  }

  const filtered = useMemo(() => {
    // '완료된 일' 탭: 완료(completed) 상태인 것만
    if (filter === 'done') return orders.filter((o: any) => o.status === 'completed')
    // 나머지 탭은 완료 제외
    const active = orders.filter((o: any) => o.status !== 'completed')
    if (filter === 'sent') return active.filter((o: any) => o.created_by === profile.id)
    if (filter === 'received') return active.filter((o: any) => o.assigned_to === profile.id)
    return active
  }, [orders, filter, profile.id])

  // PC 3컬럼용 분류
  const sentOrders = useMemo(() =>
    orders.filter((o: any) => o.status !== 'completed' && o.created_by === profile.id),
    [orders, profile.id]
  )
  const receivedOrders = useMemo(() =>
    orders.filter((o: any) => o.status !== 'completed' && o.assigned_to === profile.id),
    [orders, profile.id]
  )
  const doneOrders = useMemo(() =>
    orders.filter((o: any) => o.status === 'completed'),
    [orders]
  )

  const doneCount = doneOrders.length

  const unconfirmedCount = orders.filter(
    (o: any) => o.status === 'unconfirmed' && o.assigned_to === profile.id
  ).length

  const isOwnerOrManager = profile.role === 'owner' || profile.role === 'manager'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="업무전달"
        action={
          isOwnerOrManager ? (
            <button
              onClick={() => setShowAdd(true)}
              className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
            >
              <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          ) : undefined
        }
      />

      {/* 월 네비게이션 */}
      <div className="bg-white border-b border-black/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-black/5"
          >
            <ChevronLeft className="w-5 h-5 text-[#007AFF]" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="flex flex-col items-center"
          >
            <span className="text-[17px] font-semibold text-black">
              {format(currentMonth, 'yyyy년 M월', { locale: ko })}
            </span>
            {!isCurrentMonth && (
              <span className="text-[11px] text-[#007AFF] mt-0.5">오늘로 이동</span>
            )}
          </button>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full active:bg-black/5',
              isCurrentMonth && 'opacity-30 pointer-events-none'
            )}
          >
            <ChevronRight className="w-5 h-5 text-[#007AFF]" />
          </button>
        </div>
      </div>

      {/* 필터 탭 — 모바일만 표시 */}
      <div className="md:hidden bg-white border-b border-black/5 px-4 pt-2 pb-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: 'all',      label: '전체' },
            { id: 'sent',     label: '전달한 업무' },
            { id: 'received', label: '받은 업무' },
            { id: 'done',     label: '완료된 업무' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as FilterType)}
              className={cn(
                'px-3 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1',
                filter === f.id
                  ? 'text-[#007AFF] border-[#007AFF]'
                  : 'text-[#8E8E93] border-transparent'
              )}
            >
              {f.label}
              {f.id === 'received' && unconfirmedCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full">
                  {unconfirmedCount}
                </span>
              )}
              {f.id === 'done' && doneCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-[#34C759]/20 text-[#34C759] text-[10px] font-bold rounded-full">
                  {doneCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 모바일: 컴팩트 리스트 ── */}
      <div className="md:hidden flex-1 overflow-y-auto pb-safe">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ios-card p-3 animate-pulse flex gap-3">
                <div className="w-1 h-10 bg-gray-200 rounded" />
                <div className="flex-1">
                  <div className="h-3.5 bg-gray-200 rounded w-2/3 mb-1.5" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <div className="ios-card p-8 text-center mt-4">
              <p className="text-[32px] mb-2">
                {filter === 'done' ? '✅' : '📌'}
              </p>
              <p className="text-[14px] font-medium text-black">
                {format(currentMonth, 'M월', { locale: ko })} {filter === 'done' ? '완료된 업무가 없습니다' : '업무전달이 없습니다'}
              </p>
              <p className="text-[13px] text-[#8E8E93] mt-1">
                {filter === 'received' ? '받은 업무전달이 없습니다'
                  : filter === 'done' ? '완료 처리된 업무전달이 여기에 표시됩니다'
                  : isCurrentMonth ? '업무전달을 등록해보세요' : '다른 달을 확인해보세요'}
              </p>
              {isOwnerOrManager && filter !== 'received' && filter !== 'done' && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-5 py-2 bg-[#007AFF] text-white text-[14px] font-medium rounded-xl active:opacity-70"
                >
                  업무전달 등록
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="ios-card mx-4 mt-3 overflow-hidden">
            {filtered.map((order: any) => (
              <OrderListRow
                key={order.id}
                order={order}
                myId={profile.id}
                getMemberName={getMemberName}
                getOrderNames={getOrderNames}
                onClick={() => setSelectedOrder(order)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── PC: 3컬럼 그리드 ── */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-5 md:items-start flex-1 min-h-0 overflow-y-auto p-5 pb-safe">

        {/* 좌: 전달한 건 (내가 만든, 미완료) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#007AFF] uppercase tracking-wide">전달한 업무</span>
            <span className="text-[12px] text-[#8E8E93] font-medium">{isLoading ? '...' : `${sentOrders.length}건`}</span>
            <div className="flex-1 h-px bg-[#007AFF]/20" />
          </div>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : sentOrders.length === 0 ? (
            <div className="ios-card p-6 text-center">
              <p className="text-[13px] text-[#8E8E93]">전달한 업무가 없습니다</p>
              {isOwnerOrManager && (
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-3 px-4 py-1.5 bg-[#007AFF] text-white text-[13px] font-medium rounded-xl active:opacity-70"
                >
                  업무전달 등록
                </button>
              )}
            </div>
          ) : (
            sentOrders.map((order: any) => (
              <OrderCard
                key={order.id}
                order={order}
                myId={profile.id}
                getMemberName={getMemberName}
                getOrderNames={getOrderNames}
                onClick={() => setSelectedOrder(order)}
              />
            ))
          )}
        </div>

        {/* 가운데: 받은 건 진행중 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#FF9500] uppercase tracking-wide">받은 업무</span>
            <span className="text-[12px] text-[#8E8E93] font-medium">{isLoading ? '...' : `${receivedOrders.length}건`}</span>
            {unconfirmedCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full">
                {unconfirmedCount}
              </span>
            )}
            <div className="flex-1 h-px bg-[#FF9500]/20" />
          </div>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : receivedOrders.length === 0 ? (
            <div className="ios-card p-6 text-center">
              <p className="text-[13px] text-[#8E8E93]">받은 업무가 없습니다</p>
            </div>
          ) : (
            receivedOrders.map((order: any) => (
              <OrderCard
                key={order.id}
                order={order}
                myId={profile.id}
                getMemberName={getMemberName}
                getOrderNames={getOrderNames}
                onClick={() => setSelectedOrder(order)}
              />
            ))
          )}
        </div>

        {/* 우측: 완료 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#34C759] uppercase tracking-wide">완료</span>
            <span className="text-[12px] text-[#8E8E93] font-medium">{isLoading ? '...' : `${doneOrders.length}건`}</span>
            <div className="flex-1 h-px bg-[#34C759]/20" />
          </div>
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : doneOrders.length === 0 ? (
            <div className="ios-card p-6 text-center">
              <p className="text-[13px] text-[#8E8E93]">
                {format(currentMonth, 'M월', { locale: ko })} 완료된 업무가 없습니다
              </p>
            </div>
          ) : (
            doneOrders.map((order: any) => (
              <OrderCard
                key={order.id}
                order={order}
                myId={profile.id}
                getMemberName={getMemberName}
                getOrderNames={getOrderNames}
                onClick={() => setSelectedOrder(order)}
              />
            ))
          )}
        </div>

      </div>

      {/* 업무전달 추가 Sheet */}
      <AddOrderSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        profile={profile}
        onSuccess={refresh}
      />

      {/* 업무전달 상세 Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        profile={profile}
        onUpdated={refresh}
      />
    </div>
  )
}

function OrderCard({
  order, myId, getMemberName, getOrderNames, onClick
}: {
  order: any
  myId: string
  getMemberName: (id: string | null) => string | null
  getOrderNames: (order: any) => { creatorName: string; assigneeName: string }
  onClick: () => void
}) {
  const isReceived = order.assigned_to === myId
  const dday = order.due_date
    ? differenceInDays(new Date(order.due_date.slice(0, 10)), new Date(new Date().toISOString().slice(0, 10)))
    : null
  const { creatorName, assigneeName } = getOrderNames(order)

  return (
    <div
      onClick={onClick}
      className="ios-card p-4 animate-fade-in-up active:scale-[0.99] transition-transform cursor-pointer h-full flex flex-col"
    >
      {/* 상단 메타 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', statusColors[order.status])}>
            {WORK_ORDER_STATUS_LABELS[order.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
          </span>
          {order.priority !== 'normal' && (
            <span className={cn('text-[11px] font-semibold', priorityColors[order.priority])}>
              {order.priority === 'urgent' ? '🔴' : order.priority === 'high' ? '🟠' : '🔵'}{' '}
              {WORK_ORDER_PRIORITY_LABELS[order.priority as keyof typeof WORK_ORDER_PRIORITY_LABELS]}
            </span>
          )}
        </div>
        {dday !== null && (
          <span
            className={cn(
              'text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0',
              dday < 0
                ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                : dday === 0
                ? 'bg-[#FF9500]/10 text-[#FF9500]'
                : 'bg-[#007AFF]/10 text-[#007AFF]'
            )}
          >
            {dday < 0 ? `D+${Math.abs(dday)}` : dday === 0 ? 'D-day' : `D-${dday}`}
          </span>
        )}
      </div>

      {/* 제목 */}
      <p className={cn(
        'text-[15px] font-semibold text-black leading-snug',
        order.status === 'completed' && 'line-through opacity-60'
      )}>
        {order.title}
      </p>

      {/* 내용 */}
      {order.content && (
        <p className="text-[13px] text-[#8E8E93] mt-1 line-clamp-2">{order.content}</p>
      )}

      {/* 하단 정보 — 자동으로 하단 정렬 */}
      <div className="flex items-center justify-between mt-auto pt-3">
        <div className="flex items-center gap-2 flex-wrap">
          {order.project && (
            <span className="text-[11px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full">
              {order.project.name}
            </span>
          )}
          <span className="text-[11px] text-[#8E8E93]">
            {creatorName} → {assigneeName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#C7C7CC]">
            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ko })}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   모바일 전용 컴팩트 리스트 행
══════════════════════════════════════════════ */
function OrderListRow({
  order, myId, getMemberName, getOrderNames, onClick
}: {
  order: any
  myId: string
  getMemberName: (id: string | null) => string | null
  getOrderNames: (order: any) => { creatorName: string; assigneeName: string }
  onClick: () => void
}) {
  const dday = order.due_date
    ? differenceInDays(
        new Date(order.due_date.slice(0, 10)),
        new Date(new Date().toISOString().slice(0, 10))
      )
    : null
  const { creatorName, assigneeName } = getOrderNames(order)
  const isDone = order.status === 'completed'

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-black/5 last:border-0 active:bg-black/5 cursor-pointer transition-colors"
    >
      {/* 상태 컬러 바 */}
      <div className={cn(
        'w-1 self-stretch rounded-full flex-shrink-0',
        order.status === 'unconfirmed' ? 'bg-[#FF3B30]' :
        order.status === 'in_progress' ? 'bg-[#FF9500]' :
        order.status === 'completed'   ? 'bg-[#34C759]' : 'bg-[#C7C7CC]'
      )} />

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {/* 제목 줄 */}
        <div className="flex items-center gap-2">
          {order.priority === 'urgent' && <span className="text-[10px]">🔴</span>}
          {order.priority === 'high'   && <span className="text-[10px]">🟠</span>}
          <p className={cn(
            'text-[14px] font-semibold text-black truncate flex-1',
            isDone && 'line-through opacity-50'
          )}>
            {order.title}
          </p>
          {dday !== null && (
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
              dday < 0 ? 'bg-[#FF3B30]/10 text-[#FF3B30]' :
              dday === 0 ? 'bg-[#FF9500]/10 text-[#FF9500]' :
              'bg-[#007AFF]/10 text-[#007AFF]'
            )}>
              {dday < 0 ? `D+${Math.abs(dday)}` : dday === 0 ? 'D-day' : `D-${dday}`}
            </span>
          )}
        </div>
        {/* 서브 줄: 현장 + 담당자 + 시간 */}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            statusColors[order.status]
          )}>
            {WORK_ORDER_STATUS_LABELS[order.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
          </span>
          {order.project && (
            <span className="text-[11px] text-[#007AFF]">{order.project.name}</span>
          )}
          <span className="text-[11px] text-[#8E8E93] truncate">
            {creatorName} → {assigneeName}
          </span>
          <span className="text-[10px] text-[#C7C7CC] ml-auto flex-shrink-0">
            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ko })}
          </span>
        </div>
      </div>
    </div>
  )
}
