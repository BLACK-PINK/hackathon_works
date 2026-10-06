'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { X, ClipboardList, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface LoginPopupProps {
  profile: any
}

// localStorage 키
const POPUP_KEY = (userId: string) => `login_popup_dismissed_${userId}`

function getDismissedUntil(userId: string): Date | null {
  try {
    const raw = localStorage.getItem(POPUP_KEY(userId))
    if (!raw) return null
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}

function setDismissedUntil(userId: string, until: Date) {
  try { localStorage.setItem(POPUP_KEY(userId), until.toISOString()) } catch {}
}

export function LoginPopup({ profile }: LoginPopupProps) {
  const supabase = createClient()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<'task' | 'as'>('task')

  // 마운트 시 닫기 유효 여부 확인
  useEffect(() => {
    const until = getDismissedUntil(profile.id)
    if (!until || new Date() > until) {
      // 약간 딜레이 후 표시 (페이지 렌더 안정화)
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [profile.id])

  // ── 나에게 할당된 미완료 업무전달 (work_orders 테이블)
  const { data: myTasks = [] } = useQuery({
    queryKey: ['popup-my-tasks', profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('work_orders')
        .select('*, project:projects(id, name), creator:user_profiles!work_orders_created_by_fkey(name)')
        .eq('company_id', profile.company_id)
        .eq('assigned_to', profile.id)
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    enabled: visible,
    staleTime: 0,
  })

  // ── 미완료 AS (company_id 전체 or 담당자=나)
  const { data: pendingAs = [] } = useQuery({
    queryKey: ['popup-pending-as', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('as_records')
        .select('*, project:projects(id, name)')
        .eq('company_id', profile.company_id)
        .neq('status', 'completed')
        .order('received_date', { ascending: false })
        .limit(20)
      return data || []
    },
    enabled: visible,
    staleTime: 0,
  })

  const hasTask = myTasks.length > 0
  const hasAs   = pendingAs.length > 0

  // 둘 다 없으면 팝업 미표시
  useEffect(() => {
    if (visible && !hasTask && !hasAs) {
      // 데이터 로드 완료 후에도 없으면 숨김
      const t = setTimeout(() => setVisible(false), 500)
      return () => clearTimeout(t)
    }
  }, [visible, hasTask, hasAs])

  // 탭 자동 선택
  useEffect(() => {
    if (visible) {
      if (hasTask) setTab('task')
      else if (hasAs) setTab('as')
    }
  }, [visible, hasTask, hasAs])

  const dismiss = (hours: number) => {
    const until = new Date()
    until.setHours(until.getHours() + hours)
    setDismissedUntil(profile.id, until)
    setVisible(false)
  }

  if (!visible) return null

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'text-[#FF3B30]'
    if (p === 'high')   return 'text-[#FF9500]'
    return 'text-[#8E8E93]'
  }
  const priorityLabel = (p: string) => {
    if (p === 'urgent') return '🔴 긴급'
    if (p === 'high')   return '🟠 높음'
    if (p === 'low')    return '⚪ 낮음'
    return '⚪ 보통'
  }
  const statusLabel = (s: string) => {
    if (s === 'unconfirmed') return { text: '미확인', cls: 'bg-[#FF3B30]/10 text-[#FF3B30]' }
    if (s === 'in_progress') return { text: '진행중', cls: 'bg-[#FF9500]/10 text-[#FF9500]' }
    if (s === 'on_hold')     return { text: '보류',   cls: 'bg-[#8E8E93]/10 text-[#8E8E93]' }
    return { text: s, cls: 'bg-[#F2F2F7] text-[#8E8E93]' }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center">
      {/* 딤 배경 */}
      <div className="absolute inset-0 bg-black/50" onClick={() => dismiss(2)} />

      {/* 팝업 본체 */}
      <div className="relative w-full max-w-lg mx-0 sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '80dvh' }}>

        {/* 헤더 */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-black/5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-[18px] font-bold text-black">오늘의 알림</h2>
              <p className="text-[13px] text-[#8E8E93] mt-0.5">
                {format(new Date(), 'M월 d일 (E)', { locale: ko })} 기준
              </p>
            </div>
            <button onClick={() => dismiss(2)}
              className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60">
              <X className="w-4 h-4 text-[#8E8E93]" />
            </button>
          </div>

          {/* 탭 */}
          <div className="flex gap-2">
            {hasTask && (
              <button
                onClick={() => setTab('task')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all',
                  tab === 'task'
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-[#F2F2F7] text-[#8E8E93]'
                )}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                업무전달
                <span className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded-full font-bold',
                  tab === 'task' ? 'bg-white/30 text-white' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                )}>
                  {myTasks.length}
                </span>
              </button>
            )}
            {hasAs && (
              <button
                onClick={() => setTab('as')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all',
                  tab === 'as'
                    ? 'bg-[#FF9500] text-white'
                    : 'bg-[#F2F2F7] text-[#8E8E93]'
                )}
              >
                <Wrench className="w-3.5 h-3.5" />
                미완료 A/S
                <span className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded-full font-bold',
                  tab === 'as' ? 'bg-white/30 text-white' : 'bg-[#FF9500]/15 text-[#FF9500]'
                )}>
                  {pendingAs.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tab === 'task' && hasTask && (
            <div className="px-4 py-3 space-y-2">
              {myTasks.map((order: any) => {
                const st = statusLabel(order.status)
                // D-day 계산
                const ddayNum = order.due_date
                  ? Math.ceil((new Date(order.due_date).getTime() - Date.now()) / 86400000)
                  : null
                const ddayStr = ddayNum === null ? null
                  : ddayNum === 0 ? 'D-day'
                  : ddayNum > 0   ? `D-${ddayNum}`
                  : `D+${Math.abs(ddayNum)}`
                const ddayCls = ddayNum !== null && ddayNum <= 0
                  ? 'text-[#FF3B30] font-bold'
                  : 'text-[#FF9500] font-semibold'

                return (
                  <div key={order.id} className="bg-[#F2F2F7] rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* 상태 + 우선순위 */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>
                            {st.text}
                          </span>
                          {order.priority !== 'normal' && order.priority !== 'low' && (
                            <span className={`text-[11px] font-semibold ${priorityColor(order.priority)}`}>
                              {priorityLabel(order.priority)}
                            </span>
                          )}
                        </div>
                        {/* 제목 */}
                        <p className="text-[15px] font-medium text-black leading-snug line-clamp-2">
                          {order.title}
                        </p>
                        {/* 보낸 사람 · 현장 */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {order.creator?.name && (
                            <span className="text-[12px] text-[#8E8E93]">
                              {order.creator.name} →
                            </span>
                          )}
                          {order.project?.name && (
                            <span className="text-[12px] text-[#007AFF]">
                              📍 {order.project.name}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* D-day */}
                      {ddayStr && (
                        <span className={`flex-shrink-0 text-[12px] ${ddayCls}`}>
                          {ddayStr}
                        </span>
                      )}
                    </div>
                    {/* 내용 */}
                    {order.content && (
                      <p className="text-[13px] text-[#636366] mt-1.5 line-clamp-2">
                        {order.content}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'as' && hasAs && (
            <div className="px-4 py-3 space-y-2">
              {pendingAs.map((record: any) => {
                const siteName = record.site_name || record.project?.name || null
                const firstContent = (record.content || '').split('\n')[0]?.replace(/^\d+\.\s*/, '') || ''
                return (
                  <div key={record.id}
                    className="bg-[#FFF9F0] border border-[#FF9500]/20 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {siteName && (
                          <p className="text-[12px] font-semibold text-[#FF9500] mb-0.5">
                            📍 {siteName}
                          </p>
                        )}
                        <p className="text-[14px] font-medium text-black leading-snug line-clamp-2">
                          {firstContent || 'A/S 내용 없음'}
                        </p>
                        {record.client_name && (
                          <p className="text-[12px] text-[#636366] mt-0.5">
                            👤 {record.client_name}{record.client_phone ? ` · ${record.client_phone}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="inline-block px-2 py-0.5 bg-[#FF9500]/15 text-[#FF9500] text-[11px] font-semibold rounded-full">
                          처리중
                        </span>
                        <p className="text-[11px] text-[#8E8E93] mt-0.5">
                          접수 {record.received_date}
                        </p>
                        {record.visit_date && (
                          <p className="text-[11px] text-[#007AFF] mt-0.5">
                            방문 {record.visit_date.slice(0, 10)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 하단 닫기 버튼 */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-black/5 bg-white">
          <div className="flex gap-2">
            <button
              onClick={() => dismiss(2)}
              className="flex-1 py-3 bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium rounded-xl active:opacity-70"
            >
              2시간 닫기
            </button>
            <button
              onClick={() => dismiss(24)}
              className="flex-1 py-3 bg-[#007AFF] text-white text-[15px] font-semibold rounded-xl active:opacity-80"
            >
              하루 종일 닫기
            </button>
          </div>
          <p className="text-center text-[11px] text-[#C7C7CC] mt-2">
            배경을 탭하면 2시간 후 다시 표시됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
