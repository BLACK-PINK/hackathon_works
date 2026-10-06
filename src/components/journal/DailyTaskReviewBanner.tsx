'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Circle, MessageSquare, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DailyTaskReviewBannerProps {
  /** 현재 로그인한 사용자 프로필 */
  profile: any
  /** 업무일지를 작성한 대상 멤버 */
  targetMember: any
  /** 날짜 (yyyy-MM-dd) */
  date: string
  /** 해당 날짜에 할일이 1개라도 있는지 여부 */
  hasAnyTask: boolean
}

export function DailyTaskReviewBanner({
  profile,
  targetMember,
  date,
  hasAnyTask,
}: DailyTaskReviewBannerProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isOwner = profile.role === 'owner'
  const isManager = profile.role === 'manager'
  const canConfirm = isOwner || isManager   // 대표 + 팀장 모두 확인 가능
  const isViewingSelf = profile.id === targetMember?.id

  const [memoOpen, setMemoOpen] = useState(false)
  const [memoInput, setMemoInput] = useState('')

  // ── 현재 리뷰 데이터 조회
  const reviewKey = ['task-review', profile.company_id, targetMember?.id, date]
  const { data: review, isLoading } = useQuery({
    queryKey: reviewKey,
    queryFn: async () => {
      if (!targetMember?.id) return null
      const { data, error } = await supabase
        .from('daily_task_reviews')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('target_user_id', targetMember.id)
        .eq('date', date)
        .maybeSingle()
      // 테이블이 없거나 스키마 오류 시 조용히 null 반환
      if (error) return null
      return data
    },
    enabled: !!targetMember?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })

  // ── upsert (확인 토글 or 메모 저장)
  const upsertReview = useMutation({
    mutationFn: async (payload: {
      is_confirmed: boolean
      memo: string | null
    }) => {
      const { error } = await supabase
        .from('daily_task_reviews')
        .upsert(
          {
            company_id: profile.company_id,
            target_user_id: targetMember.id,
            date,
            reviewer_id: profile.id,
            is_confirmed: payload.is_confirmed,
            memo: payload.memo,
            confirmed_at: payload.is_confirmed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id,target_user_id,date' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKey })
    },
    onError: (e: any) => {
      const msg = e?.message || ''
      toast.error(`저장 실패: ${msg}`)
      console.error('[DailyTaskReview] upsert error:', e)
    },
  })

  // 조건: 본인 일지를 볼 때는 배너 불필요, 할일 없을 때도 숨김
  if (isViewingSelf || !hasAnyTask) return null
  if (isLoading) return null

  const isConfirmed = review?.is_confirmed ?? false
  const existingMemo = review?.memo ?? ''
  const confirmedAt = review?.confirmed_at
    ? new Date(review.confirmed_at).toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const handleToggleConfirm = () => {
    if (!canConfirm) return
    upsertReview.mutate({
      is_confirmed: !isConfirmed,
      memo: existingMemo || null,
    })
  }

  const handleSaveMemo = () => {
    upsertReview.mutate({
      is_confirmed: isConfirmed,
      memo: memoInput.trim() || null,
    })
    setMemoOpen(false)
    toast.success('비고가 저장되었습니다')
  }

  return (
    <div className={cn(
      'mx-4 mt-4 rounded-2xl border-2 overflow-hidden transition-all',
      isConfirmed
        ? 'border-[#34C759]/30 bg-[#34C759]/5'
        : 'border-[#FF9500]/20 bg-[#FF9500]/5'
    )}>
      {/* ── 메인 행 */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* 확인 버튼 (owner만 토글 가능) */}
        <button
          onClick={handleToggleConfirm}
          disabled={!canConfirm || upsertReview.isPending}
          className={cn(
            'flex-shrink-0 transition-transform active:scale-90',
            !canConfirm && 'cursor-default'
          )}
        >
          {upsertReview.isPending
            ? <Loader2 className="w-6 h-6 text-[#8E8E93] animate-spin" />
            : isConfirmed
              ? <CheckCircle2 className="w-6 h-6 text-[#34C759]" />
              : <Circle className="w-6 h-6 text-[#FF9500]" />
          }
        </button>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          {isConfirmed ? (
            <div>
              <p className="text-[14px] font-semibold text-[#34C759]">
                ✅ 확인 함
              </p>
              {confirmedAt && (
                <p className="text-[11px] text-[#8E8E93] mt-0.5">{confirmedAt}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[14px] font-semibold text-[#FF9500]">
                {isOwner ? '확인 대기 중' : '확인 대기 중'}
              </p>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">
                {canConfirm
                  ? `${targetMember?.name}님의 업무일지를 확인하세요`
                  : '아직 확인하지 않았습니다'}
              </p>
            </div>
          )}
        </div>

        {/* 비고 토글 버튼 (대표/팀장) */}
        {canConfirm && (
          <button
            onClick={() => {
              setMemoInput(existingMemo)
              setMemoOpen(!memoOpen)
            }}
            className="flex-shrink-0 flex items-center gap-1 text-[#8E8E93] active:opacity-60"
          >
            <MessageSquare className={cn(
              'w-4 h-4',
              existingMemo ? 'text-[#007AFF]' : 'text-[#C7C7CC]'
            )} />
            {memoOpen
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>

      {/* ── 기존 비고 (읽기 전용, 확인 권한 없는 일반 직원용) */}
      {!canConfirm && existingMemo && (
        <div className="px-4 pb-3 pt-0">
          <div className="bg-white/60 rounded-xl px-3 py-2">
            <p className="text-[11px] text-[#8E8E93] font-medium mb-0.5">대표 비고</p>
            <p className="text-[13px] text-[#3C3C43] leading-relaxed">{existingMemo}</p>
          </div>
        </div>
      )}

      {/* ── 비고 입력 영역 (대표/팀장용, 펼침) */}
      {canConfirm && memoOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-black/5 bg-white/50">
          <div className="pt-3 space-y-2">
            <label className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide block">
              비고 메모
            </label>
            <textarea
              value={memoInput}
              onChange={(e) => setMemoInput(e.target.value)}
              placeholder="업무 관련 코멘트, 지시사항 등을 입력하세요"
              rows={3}
              className="w-full px-3 py-2.5 bg-white border border-black/8 rounded-xl
                         text-[14px] text-black placeholder:text-[#C7C7CC]
                         outline-none focus:border-[#007AFF]/40 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMemoOpen(false)}
                className="px-4 py-1.5 text-[13px] text-[#8E8E93] active:opacity-60"
              >
                취소
              </button>
              <button
                onClick={handleSaveMemo}
                disabled={upsertReview.isPending}
                className="px-4 py-1.5 bg-[#007AFF] text-white text-[13px] font-medium rounded-xl active:opacity-70 disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
