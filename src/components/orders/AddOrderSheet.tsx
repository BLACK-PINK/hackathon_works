'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sendPushNotification } from '@/lib/usePushNotification'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'

interface AddOrderSheetProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  profile: any
}

export function AddOrderSheet({ open, onClose, onSuccess, profile }: AddOrderSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState('normal')
  const [projectId, setProjectId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')

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

  const { data: members = [] } = useQuery({
    queryKey: ['members-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .neq('id', profile.id)
        .order('name')
      return data || []
    },
  })

  const addOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('work_orders').insert({
        company_id: profile.company_id,
        title: title.trim(),
        content: content.trim() || null,
        priority,
        status: 'unconfirmed',
        project_id: projectId || null,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        created_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'], exact: false })
      if (onSuccess) onSuccess()
      toast.success('업무전달이 등록되었습니다')
      // 담당자에게 푸시 알림
      if (assignedTo) {
        sendPushNotification({
          userIds: [assignedTo],
          title: '📌 업무전달이 도착했습니다',
          body: title.trim(),
          url: '/orders',
          tag: 'order-new',
        })
      } else {
        // 전체 회사 알림
        sendPushNotification({
          companyId: profile.company_id,
          title: '📌 업무전달이 등록되었습니다',
          body: title.trim(),
          url: '/orders',
          tag: 'order-new',
        })
      }
      handleClose()
    },
    onError: (e: any) => toast.error(`등록 실패: ${e?.message || '다시 시도해주세요'}`),
  })

  const handleClose = () => {
    setTitle('')
    setContent('')
    setPriority('normal')
    setProjectId('')
    setAssignedTo('')
    setDueDate('')
    onClose()
  }

  const handleSubmit = () => {
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return }
    addOrder.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 flex flex-col" style={{ maxHeight: '92dvh' }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="px-5 pb-3 border-b border-black/5">
          <div className="flex items-center justify-between">
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">업무전달 등록</SheetTitle>
            <button
              onClick={handleSubmit}
              disabled={addOrder.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {addOrder.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {/* 제목 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="업무 지시 내용을 입력하세요"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 상세 내용 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">상세 내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-2 rounded-xl text-[13px] font-medium border-2 transition-all ${
                    priority === p.value
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
          {members.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">담당자</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none"
              >
                <option value="">담당자 선택</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 현장 */}
          {projects.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none"
              >
                <option value="">현장 선택 (선택)</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 마감 날짜/시간 */}
          <div>
            <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">마감 날짜 / 시간</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none"
            />
          </div>

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
