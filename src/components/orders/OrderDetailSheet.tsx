'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sendPushNotification } from '@/lib/usePushNotification'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_PRIORITY_LABELS } from '@/types'
import { differenceInDays, formatDistanceToNow, format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Calendar, MapPin, User, Clock, Trash2 } from 'lucide-react'

interface OrderDetailSheetProps {
  order: any | null
  open: boolean
  onClose: () => void
  onUpdated?: () => void
  profile: any
}

const statusColors: Record<string, string> = {
  unconfirmed: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  in_progress: 'bg-[#FF9500]/10 text-[#FF9500]',
  completed: 'bg-[#34C759]/10 text-[#34C759]',
  on_hold: 'bg-[#8E8E93]/10 text-[#8E8E93]',
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  high: 'bg-[#FF9500]/10 text-[#FF9500]',
  normal: 'bg-[#007AFF]/10 text-[#007AFF]',
  low: 'bg-[#8E8E93]/10 text-[#8E8E93]',
}

export function OrderDetailSheet({ order, open, onClose, onUpdated, profile }: OrderDetailSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 댓글 수정 상태
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  // 수정 폼 상태
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editAssignedTo, setEditAssignedTo] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [editDueDate, setEditDueDate] = useState('')

  const isOwnerOrManager = profile.role === 'owner' || profile.role === 'manager'
  const isCreator = order?.created_by === profile.id
  // 수정 권한: 작성자 본인만
  const canEdit = isCreator
  // 삭제 권한: 작성자 또는 owner/manager
  const canDelete = isCreator || isOwnerOrManager

  // 멤버 이름 조회 (is_active 조건 제거 — 비활성 유저 포함 전체 조회)
  const { data: members = [] } = useQuery({
    queryKey: ['members-all-no-filter', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('company_id', profile.company_id)
      if (error) console.error('[members query error]', error)
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
    staleTime: 60000,
  })

  const getMemberName = (id: string | null) => {
    if (!id) return null
    return (members as any[]).find((m) => m.id === id)?.name || null
  }

  const creatorName = getMemberName(order?.created_by) || '-'
  const assigneeName = getMemberName(order?.assigned_to) || '미지정'

  // 수정 모드 진입
  const enterEdit = () => {
    setEditTitle(order.title || '')
    setEditContent(order.content || '')
    setEditPriority(order.priority || 'normal')
    setEditAssignedTo(order.assigned_to || '')
    setEditProjectId(order.project_id || '')
    setEditDueDate(order.due_date || '')
    setIsEditing(true)
  }

  // 댓글 조회
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['order-comments', order?.id],
    queryFn: async () => {
      if (!order?.id) return []
      const { data, error } = await supabase
        .from('work_order_comments')
        .select('*')
        .eq('work_order_id', order.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!order?.id && open,
    staleTime: 0,
    gcTime: 0,
  })

  // 상태 변경
  const changeStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const updates: any = { status: newStatus }
      if (newStatus === 'in_progress' && !order.confirmed_at) {
        updates.confirmed_at = new Date().toISOString()
      }
      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString()
      }
      const { error } = await supabase
        .from('work_orders')
        .update(updates)
        .eq('id', order.id)
      if (error) throw error
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'], exact: false })
      const label = WORK_ORDER_STATUS_LABELS[newStatus as keyof typeof WORK_ORDER_STATUS_LABELS]
      toast.success(`상태가 "${label}"으로 변경되었습니다`)
      if (order?.created_by && order.created_by !== profile.id) {
        sendPushNotification({
          userIds: [order.created_by],
          title: `📌 업무 상태 변경: ${label}`,
          body: order.title || '업무전달',
          url: '/orders',
          tag: 'order-status',
        })
      }
      onUpdated?.()
      onClose()
    },
    onError: (e: any) => toast.error(`변경 실패: ${e?.message}`),
  })

  // 업무전달 수정
  const updateOrder = useMutation({
    mutationFn: async () => {
      if (!editTitle.trim()) throw new Error('제목을 입력해주세요')
      const { error } = await supabase
        .from('work_orders')
        .update({
          title: editTitle.trim(),
          content: editContent.trim() || null,
          priority: editPriority,
          assigned_to: editAssignedTo || null,
          project_id: editProjectId || null,
          due_date: editDueDate || null,
        })
        .eq('id', order.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'], exact: false })
      toast.success('업무전달이 수정되었습니다')
      setIsEditing(false)
      onUpdated?.()
    },
    onError: (e: any) => toast.error(`수정 실패: ${e?.message}`),
  })

  // 댓글 추가
  const addComment = useMutation({
    mutationFn: async () => {
      if (!comment.trim()) throw new Error('댓글을 입력해주세요')
      const { error } = await supabase.from('work_order_comments').insert({
        company_id: profile.company_id,
        work_order_id: order.id,
        content: comment.trim(),
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setComment('')
      refetchComments()
      toast.success('댓글이 등록되었습니다')
    },
    onError: (e: any) => toast.error(e.message || '댓글 등록 실패'),
  })

  // 댓글 수정
  const updateComment = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('work_order_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('created_by', profile.id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingCommentId(null)
      setEditingCommentText('')
      refetchComments()
      toast.success('댓글이 수정되었습니다')
    },
    onError: (e: any) => toast.error(e.message || '댓글 수정 실패'),
  })

  // 댓글 삭제
  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('work_order_comments')
        .delete()
        .eq('id', id)
        .eq('created_by', profile.id)
      if (error) throw error
    },
    onSuccess: () => {
      refetchComments()
      toast.success('댓글이 삭제되었습니다')
    },
    onError: (e: any) => toast.error(e.message || '댓글 삭제 실패'),
  })

  // 업무전달 삭제
  const deleteOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('work_orders').delete().eq('id', order.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'], exact: false })
      toast.success('업무전달이 삭제되었습니다')
      setShowDeleteConfirm(false)
      onUpdated?.()
      onClose()
    },
    onError: (e: any) => toast.error(`삭제 실패: ${e?.message}`),
  })

  if (!order) return null

  const dday = order.due_date
    ? differenceInDays(new Date(order.due_date.slice(0, 10)), new Date(new Date().toISOString().slice(0, 10)))
    : null

  const statusOptions = [
    { value: 'unconfirmed', label: '미확인', show: isOwnerOrManager || isCreator },
    { value: 'in_progress', label: '진행중', show: true },
    { value: 'completed', label: '완료', show: true },
    { value: 'on_hold', label: '보류', show: true },
  ].filter(s => s.show)

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setIsEditing(false); setShowDeleteConfirm(false); onClose() } }}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 flex flex-col [&>button]:hidden" style={{ maxHeight: '92dvh' }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button
              onClick={isEditing ? () => setIsEditing(false) : onClose}
              className="text-[#007AFF] text-[16px]"
            >
              {isEditing ? '취소' : '닫기'}
            </button>
            <SheetTitle className="text-[17px] font-semibold">
              {isEditing ? '업무전달 수정' : '업무전달 상세'}
            </SheetTitle>
            {isEditing ? (
              <button
                onClick={() => updateOrder.mutate()}
                disabled={updateOrder.isPending}
                className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
              >
                {updateOrder.isPending ? '저장중...' : '저장'}
              </button>
            ) : canEdit ? (
              <button onClick={enterEdit} className="text-[#007AFF] text-[16px] font-semibold">
                수정
              </button>
            ) : (
              <div className="w-12" />
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {isEditing ? (
            /* ── 수정 모드 ── */
            <>
              {/* 제목 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">제목 *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="업무 지시 내용"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
                />
              </div>

              {/* 상세 내용 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">상세 내용</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="상세 내용 (선택)"
                  rows={3}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
                />
              </div>

              {/* 우선순위 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">우선순위</label>
                <div className="flex gap-2">
                  {[
                    { value: 'low', label: '낮음' },
                    { value: 'normal', label: '보통' },
                    { value: 'high', label: '높음' },
                    { value: 'urgent', label: '긴급' },
                  ].map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setEditPriority(p.value)}
                      className={`flex-1 py-2 rounded-xl text-[13px] font-medium border-2 transition-all ${
                        editPriority === p.value
                          ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                          : 'border-transparent bg-[#F2F2F7] text-[#8E8E93]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 담당자 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">담당자</label>
                <select
                  value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none"
                >
                  <option value="">담당자 선택</option>
                  {(members as any[]).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* 현장 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장</label>
                <select
                  value={editProjectId}
                  onChange={(e) => setEditProjectId(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none"
                >
                  <option value="">현장 선택 (선택)</option>
                  {(projects as any[]).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* 마감 날짜/시간 */}
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">마감 날짜 / 시간</label>
                <input
                  type="datetime-local"
                  value={editDueDate ? editDueDate.slice(0, 16) : ''}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
                />
              </div>

              <div className="pb-8" />
            </>
          ) : (
            /* ── 상세 보기 모드 ── */
            <>
              {/* 상태 + 우선순위 배지 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-[12px] px-3 py-1 rounded-full font-medium', statusColors[order.status])}>
                  {WORK_ORDER_STATUS_LABELS[order.status as keyof typeof WORK_ORDER_STATUS_LABELS]}
                </span>
                {order.priority && order.priority !== 'normal' && (
                  <span className={cn('text-[12px] px-3 py-1 rounded-full font-medium', priorityColors[order.priority])}>
                    {WORK_ORDER_PRIORITY_LABELS[order.priority as keyof typeof WORK_ORDER_PRIORITY_LABELS]}
                  </span>
                )}
                {dday !== null && (
                  <span className={cn(
                    'text-[12px] px-3 py-1 rounded-full font-bold',
                    dday < 0 ? 'bg-[#FF3B30]/10 text-[#FF3B30]'
                      : dday === 0 ? 'bg-[#FF9500]/10 text-[#FF9500]'
                      : 'bg-[#007AFF]/10 text-[#007AFF]'
                  )}>
                    {dday < 0 ? `D+${Math.abs(dday)}` : dday === 0 ? 'D-day' : `D-${dday}`}
                  </span>
                )}
              </div>

              {/* 제목 + 내용 */}
              <div className="ios-card p-4">
                <h2 className={cn(
                  'text-[18px] font-bold text-black leading-snug',
                  order.status === 'completed' && 'line-through opacity-60'
                )}>
                  {order.title}
                </h2>
                {order.content && (
                  <p className="text-[14px] text-[#3C3C43] mt-2 leading-relaxed">{order.content}</p>
                )}
              </div>

              {/* 메타 정보 */}
              <div className="ios-card divide-y divide-black/5 overflow-hidden">
                {order.project && (
                  <div className="flex items-center gap-3 p-3.5">
                    <MapPin className="w-4 h-4 text-[#8E8E93]" />
                    <div>
                      <p className="text-[11px] text-[#8E8E93]">현장</p>
                      <p className="text-[14px] text-black">{order.project.name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3.5">
                  <User className="w-4 h-4 text-[#8E8E93]" />
                  <div>
                    <p className="text-[11px] text-[#8E8E93]">지시 → 담당</p>
                    <p className="text-[14px] text-black">{creatorName} → {assigneeName}</p>
                  </div>
                </div>
                {order.due_date && (
                  <div className="flex items-center gap-3 p-3.5">
                    <Calendar className="w-4 h-4 text-[#8E8E93]" />
                    <div>
                      <p className="text-[11px] text-[#8E8E93]">마감일</p>
                      <p className="text-[14px] text-black">
                        {order.due_date
                          ? (() => {
                              const d = new Date(order.due_date)
                              const hasTime = order.due_date.includes('T') || order.due_date.length > 10
                              return hasTime
                                ? format(d, 'yyyy.MM.dd HH:mm')
                                : format(d, 'yyyy.MM.dd')
                            })()
                          : '-'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3.5">
                  <Clock className="w-4 h-4 text-[#8E8E93]" />
                  <div>
                    <p className="text-[11px] text-[#8E8E93]">등록</p>
                    <p className="text-[14px] text-black">
                      {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ko })}
                    </p>
                  </div>
                </div>
              </div>

              {/* 상태 변경 */}
              <div>
                <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-2">상태 변경</p>
                <div className="flex gap-2">
                  {statusOptions.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => changeStatus.mutate(s.value)}
                      disabled={order.status === s.value || changeStatus.isPending}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all',
                        order.status === s.value
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-[#F2F2F7] text-[#8E8E93] active:opacity-60'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 댓글 */}
              <div>
                <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-2">
                  댓글 ({comments.length})
                </p>
                <div className="space-y-2 mb-3">
                  {comments.length === 0 ? (
                    <div className="ios-card p-4 text-center text-[13px] text-[#8E8E93]">
                      첫 댓글을 남겨보세요
                    </div>
                  ) : (
                    comments.map((c: any) => {
                      const isMyComment = c.created_by === profile.id
                      const isEditing = editingCommentId === c.id
                      return (
                        <div key={c.id} className="ios-card p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-semibold text-black">{getMemberName(c.created_by) || '-'}</span>
                              {c.updated_at && c.updated_at !== c.created_at && (
                                <span className="text-[10px] text-[#8E8E93] bg-[#F2F2F7] px-1.5 py-0.5 rounded-full">수정됨</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#C7C7CC]">
                                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ko })}
                              </span>
                              {isMyComment && !isEditing && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingCommentId(c.id)
                                      setEditingCommentText(c.content)
                                    }}
                                    className="text-[11px] text-[#007AFF] active:opacity-60 px-1">
                                    수정
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm('댓글을 삭제할까요?')) {
                                        deleteComment.mutate(c.id)
                                      }
                                    }}
                                    className="text-[11px] text-[#FF3B30] active:opacity-60 px-1">
                                    삭제
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {isEditing ? (
                            <div className="mt-1.5">
                              <textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                rows={2}
                                autoFocus
                                className="w-full px-3 py-2 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none resize-none"
                              />
                              <div className="flex gap-2 mt-1.5 justify-end">
                                <button
                                  onClick={() => { setEditingCommentId(null); setEditingCommentText('') }}
                                  className="text-[12px] text-[#8E8E93] px-3 py-1.5">
                                  취소
                                </button>
                                <button
                                  onClick={() => {
                                    if (editingCommentText.trim()) {
                                      updateComment.mutate({ id: c.id, content: editingCommentText.trim() })
                                    }
                                  }}
                                  disabled={updateComment.isPending || !editingCommentText.trim()}
                                  className="text-[12px] text-white bg-[#007AFF] px-3 py-1.5 rounded-lg disabled:opacity-40">
                                  {updateComment.isPending ? '저장중...' : '저장'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[14px] text-[#3C3C43]">{c.content}</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addComment.mutate()}
                    placeholder="댓글 입력..."
                    className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
                  />
                  <button
                    onClick={() => addComment.mutate()}
                    disabled={!comment.trim() || addComment.isPending}
                    className="px-4 py-3 bg-[#007AFF] text-white text-[14px] font-semibold rounded-xl disabled:opacity-40 active:opacity-70"
                  >
                    {addComment.isPending ? '...' : '전송'}
                  </button>
                </div>
              </div>

              {/* 삭제 버튼 (작성자 or owner/manager) */}
              {canDelete && (
                <div>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-3 flex items-center justify-center gap-1.5 text-[#FF3B30] text-[15px] font-medium active:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </button>
                  ) : (
                    <div className="bg-[#FFF2F0] rounded-xl p-4 border border-[#FF3B30]/15 space-y-3">
                      <p className="text-[14px] font-medium text-black text-center">이 업무전달을 삭제할까요?</p>
                      <p className="text-[12px] text-[#8E8E93] text-center">댓글을 포함한 모든 데이터가 삭제됩니다</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-2.5 bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium rounded-xl active:opacity-70"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => deleteOrder.mutate()}
                          disabled={deleteOrder.isPending}
                          className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[15px] font-semibold rounded-xl flex items-center justify-center gap-1.5 active:opacity-80 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleteOrder.isPending ? '삭제중...' : '삭제 확인'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pb-8" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
