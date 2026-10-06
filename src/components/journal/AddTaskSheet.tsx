'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendPushNotification } from '@/lib/usePushNotification'

interface AddTaskSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  date: string
  profile: any
}

interface TaskRow {
  id: number
  title: string
  important: boolean
}

// 안드로이드 호환 중요도 버튼 (이모티콘 대신 CSS 원)
function ImportantBtn({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={cn(
        'flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all active:scale-90',
        active
          ? 'bg-[#FF3B30] border-[#FF3B30] shadow-sm shadow-[#FF3B30]/30'
          : 'bg-transparent border-[#D1D1D6]'
      )}
      aria-label={active ? '중요 해제' : '중요 설정'}
    />
  )
}

let nextId = 1
const makeRow = (): TaskRow => ({ id: nextId++, title: '', important: false })
const makeRows = (n: number): TaskRow[] => Array.from({ length: n }, makeRow)

export function AddTaskSheet({ open, onClose, onSuccess, date, profile }: AddTaskSheetProps) {
  const supabase = createClient()
  const [rows, setRows] = useState<TaskRow[]>(() => makeRows(10))
  const scrollRef = useRef<HTMLDivElement>(null)

  // 시트 열릴 때 초기화 + 스크롤 맨 위
  useEffect(() => {
    if (open) {
      setRows(makeRows(10))
      setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 50)
    }
  }, [open])

  const updateRow = (id: number, patch: Partial<TaskRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const addRow = () => {
    const r = makeRow()
    setRows(prev => [...prev, r])
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const filled = rows.filter(r => r.title.trim())
      if (filled.length === 0) throw new Error('내용을 하나 이상 입력해주세요')

      const rowsToInsert = filled.map(r => ({
        company_id: profile.company_id,
        date,
        title: r.title.trim(),
        content: null,
        priority: r.important ? 'high' : 'normal',
        status: 'todo',
        project_id: null,
        assigned_to: null,
        created_by: profile.id,
      }))

      const { error } = await supabase.from('daily_tasks').insert(rowsToInsert)
      if (error) throw error
    },
    onSuccess: async () => {
      const count = rows.filter(r => r.title.trim()).length
      toast.success(`${count}개 업무일지가 저장되었습니다`)

      // 푸시 알림: owner에게는 전 직원 알림, manager에게는 본인보다 낮은 등급(member) 알림
      try {
        // owner → 전체 직원(본인 제외)
        // manager → member 직원(본인 제외)
        // member → 알림 없음 (owner+manager에게만 발송)
        const targetRoles = profile.role === 'owner'
          ? ['owner', 'manager']   // 대표가 작성 → 다른 owner/manager에게
          : ['owner', 'manager']   // 직원/매니저가 작성 → 대표+매니저에게

        const { data: superiors } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('company_id', profile.company_id)
          .in('role', targetRoles)
          .neq('id', profile.id)

        const targetIds = (superiors || []).map((m: any) => m.id)
        if (targetIds.length > 0) {
          sendPushNotification({
            userIds: targetIds,
            title: '📝 업무일지 작성',
            body: `${profile.name}님이 업무일지를 작성했습니다 (${count}건)`,
            url: '/journal/task',
            tag: 'journal-new',
          })
        }
      } catch (err) {
        // 알림 실패는 조용히 무시 (저장 자체는 성공)
        console.warn('[AddTaskSheet] 푸시 알림 발송 실패:', err)
      }

      onClose()
      onSuccess()
    },
    onError: (e: any) => {
      toast.error(e?.message || '저장에 실패했습니다')
    },
  })

  const handleSubmit = () => {
    if (rows.filter(r => r.title.trim()).length === 0) {
      toast.error('내용을 하나 이상 입력해주세요')
      return
    }
    saveMutation.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ height: '92dvh', maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── 헤더 ── */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">취소</button>
            <div className="text-center">
              <SheetTitle className="text-[17px] font-semibold">업무일지 작성</SheetTitle>
              <p className="text-[12px] text-[#8E8E93] mt-0.5">{date}</p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {saveMutation.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* ── 안내 문구 ── */}
        <div className="px-5 pt-3 pb-1 flex-shrink-0 flex items-center gap-2">
          <span className="text-[12px] text-[#8E8E93]">오늘 업무 내용을 입력하세요</span>
          <span className="text-[11px] text-[#8E8E93] flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#FF3B30] inline-block flex-shrink-0" />
            = 중요
          </span>
        </div>

        {/* ── 입력 목록 ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-2"
          style={{ WebkitOverflowScrolling: 'touch' as any }}
        >
          <div className="ios-card overflow-hidden">
            {rows.map((row, idx) => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  idx !== rows.length - 1 && 'border-b border-black/5'
                )}
              >
                {/* 번호 */}
                <span className="w-5 text-[13px] font-medium text-[#C7C7CC] flex-shrink-0 text-center">
                  {idx + 1}
                </span>

                {/* 중요도 토글 버튼 - 텍스트 입력 왼쪽에 배치 */}
                <ImportantBtn
                  active={row.important}
                  onToggle={() => updateRow(row.id, { important: !row.important })}
                />

                {/* 텍스트 입력 */}
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  placeholder="업무 내용"
                  className="flex-1 text-[15px] text-black placeholder:text-[#D1D1D6] outline-none bg-transparent"
                />
              </div>
            ))}
          </div>

          {/* ── 추가 버튼 ── */}
          <button
            type="button"
            onClick={addRow}
            className="w-full mt-3 py-3.5 bg-white rounded-2xl border border-black/8 flex items-center justify-center gap-2 text-[#007AFF] text-[15px] font-medium active:opacity-60 active:scale-[0.98] transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            추가하기
          </button>

          <div className="pb-10" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
