'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, Phone, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AsRecordListProps {
  profile: any
  onAdd?: () => void
}

export function AsRecordList({ profile, onAdd }: AsRecordListProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['as-records', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('as_records')
        .select(`
          *,
          project:projects(id, name),
          assignee:user_profiles!as_records_assigned_to_fkey(id, name),
          creator:user_profiles!as_records_created_by_fkey(id, name)
        `)
        .eq('company_id', profile.company_id)
        .order('received_date', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // 완료 처리 mutation
  const completeMutation = useMutation({
    mutationFn: async (recordId: number) => {
      const { error } = await supabase
        .from('as_records')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString().slice(0, 10),
        })
        .eq('id', recordId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('A/S가 완료 처리되었습니다')
      queryClient.invalidateQueries({ queryKey: ['as-records', profile.company_id] })
    },
    onError: () => {
      toast.error('완료 처리에 실패했습니다')
    },
  })

  // 완료 취소 (되돌리기) mutation
  const revertMutation = useMutation({
    mutationFn: async (recordId: number) => {
      const { error } = await supabase
        .from('as_records')
        .update({
          status: 'received',
          completed_date: null,
        })
        .eq('id', recordId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('완료가 취소되었습니다')
      queryClient.invalidateQueries({ queryKey: ['as-records', profile.company_id] })
    },
    onError: () => {
      toast.error('처리에 실패했습니다')
    },
  })

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ios-card p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const active = records.filter(
    (r: any) => r.status !== 'completed' && r.status !== 'cancelled'
  )
  const done = records.filter(
    (r: any) => r.status === 'completed' || r.status === 'cancelled'
  )

  return (
    <div className="p-4 space-y-4 pb-safe">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
          처리중 {active.length}건
        </p>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[#007AFF] text-[13px] font-medium active:opacity-60"
          >
            <Plus className="w-4 h-4" />
            접수
          </button>
        )}
      </div>

      {/* 빈 상태 */}
      {records.length === 0 && (
        <div className="ios-card p-8 text-center">
          <p className="text-[32px] mb-2">🔧</p>
          <p className="text-[14px] font-medium text-black">A/S 접수 내역이 없습니다</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">A/S 요청을 접수해보세요</p>
          {onAdd && (
            <button
              onClick={onAdd}
              className="mt-4 px-5 py-2 bg-[#007AFF] text-white text-[14px] font-medium rounded-xl active:opacity-70"
            >
              A/S 접수
            </button>
          )}
        </div>
      )}

      {/* 처리중 목록 */}
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((record: any) => (
            <AsCard
              key={record.id}
              record={record}
              onComplete={() => completeMutation.mutate(record.id)}
              isPending={completeMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* 완료 목록 */}
      {done.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-2">
            <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
              완료 {done.length}건
            </p>
            <div className="flex-1 h-px bg-black/5" />
          </div>
          {done.map((record: any) => (
            <AsCard
              key={record.id}
              record={record}
              isDone
              onRevert={() => revertMutation.mutate(record.id)}
              isPending={revertMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface AsCardProps {
  record: any
  isDone?: boolean
  onComplete?: () => void
  onRevert?: () => void
  isPending?: boolean
}

function AsCard({ record, isDone = false, onComplete, onRevert, isPending }: AsCardProps) {
  return (
    <div className={cn(
      'ios-card p-4 flex items-start gap-3 animate-fade-in-up',
      isDone && 'opacity-60'
    )}>
      {/* 완료 체크 버튼 */}
      <button
        onClick={isDone ? onRevert : onComplete}
        disabled={isPending}
        className="flex-shrink-0 mt-0.5 active:opacity-60 disabled:opacity-40"
      >
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-[#34C759]" />
        ) : (
          <Circle className="w-5 h-5 text-[#C7C7CC]" />
        )}
      </button>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {/* 상단: 날짜 */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[#8E8E93]">
            접수 {record.received_date}
          </span>
          {record.completed_date && (
            <span className="text-[11px] text-[#34C759]">
              완료 {record.completed_date}
            </span>
          )}
        </div>

        {/* A/S 내용 — 완료 시 취소선 */}
        <p className={cn(
          'text-[15px] font-medium text-black leading-snug',
          isDone && 'line-through text-[#8E8E93]'
        )}>
          {record.content}
        </p>

        {/* 현장 · 고객 · 담당자 태그 */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {record.project && (
            <span className="text-[11px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full">
              {record.project.name}
            </span>
          )}
          {record.client_name && (
            <span className="text-[11px] text-[#8E8E93] flex items-center gap-0.5">
              <Phone className="w-3 h-3" />
              {record.client_name}
              {record.client_phone && ` · ${record.client_phone}`}
            </span>
          )}
          {record.assignee && (
            <span className="text-[11px] text-[#8E8E93]">
              담당: {record.assignee.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
