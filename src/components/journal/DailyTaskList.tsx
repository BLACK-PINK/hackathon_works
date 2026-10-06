'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, CheckCircle2, Circle,
  MapPin, User, Building2, Trash2, CalendarArrowUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DailyTaskReviewBanner } from '@/components/journal/DailyTaskReviewBanner'
import { addDays, format } from 'date-fns'

interface DailyTaskListProps {
  date: string
  profile: any
  viewUserId: string
  viewingMember: any
  onAdd?: () => void
}

// 오늘 날짜 (yyyy-MM-dd)
const todayStr = format(new Date(), 'yyyy-MM-dd')

interface TaskGroup {
  projectId: string | null
  projectName: string
  tasks: any[]
}

function groupByProject(tasks: any[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>()
  for (const task of tasks) {
    const key = task.project_id ?? '__none__'
    if (!map.has(key)) {
      map.set(key, {
        projectId: task.project_id ?? null,
        projectName: task.projects?.name ?? '공통 업무',
        tasks: [],
      })
    }
    map.get(key)!.tasks.push(task)
  }
  const groups = Array.from(map.values())
  groups.sort((a, b) => {
    if (a.projectId === null) return 1
    if (b.projectId === null) return -1
    return a.projectName.localeCompare(b.projectName)
  })
  return groups
}

// ─────────────────────────────────────────────
// ImportantDot: CSS 원 (안드로이드 호환)
// ─────────────────────────────────────────────
function ImportantDot({
  active,
  onToggle,
  disabled,
}: {
  active: boolean
  onToggle?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      disabled={disabled}
      className={cn(
        'flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all',
        active ? 'bg-[#FF3B30] border-[#FF3B30]' : 'bg-transparent border-[#D1D1D6]',
        disabled && 'pointer-events-none'
      )}
    />
  )
}

// ─────────────────────────────────────────────
// DailyTaskList 메인
// ─────────────────────────────────────────────
export function DailyTaskList({
  date,
  profile,
  viewUserId,
  viewingMember,
  onAdd,
}: DailyTaskListProps) {
  const supabase = createClient()
  const isViewingSelf = profile.id === viewUserId

  const { data: memberMap = {} } = useQuery({
    queryKey: ['member-map', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('company_id', profile.company_id)
      const map: Record<string, string> = {}
      for (const m of data || []) map[m.id] = m.name
      return map
    },
    staleTime: 60_000,
  })

  // 과거 날짜 여부 (오늘 포함 이전)
  const isPast = date <= todayStr

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['daily-tasks', date, profile.company_id, viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('date', date)
        .eq('created_by', viewUserId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!isViewingSelf) return
      const newStatus = status === 'done' ? 'todo' : 'done'
      const { error } = await supabase
        .from('daily_tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => refetch(),
    onError: () => toast.error('상태 변경에 실패했습니다'),
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

  const todos = tasks.filter((t: any) => t.status !== 'done')
  const dones = tasks.filter((t: any) => t.status === 'done')
  const todoGroups = groupByProject(todos)
  const nextDate = format(addDays(new Date(date + 'T00:00:00'), 1), 'yyyy-MM-dd')

  return (
    <div className="pb-safe">
      <DailyTaskReviewBanner
        profile={profile}
        targetMember={viewingMember}
        date={date}
        hasAnyTask={tasks.length > 0}
      />

      <div className="p-4 space-y-5">

        {/* ── TO-DO 섹션 ── */}
        <div>
          <div className="flex items-center mb-3">
            <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
              {isViewingSelf
                ? `To-do (${todos.length})`
                : `${viewingMember?.name}님 To-do (${todos.length})`}
            </p>
          </div>

          {todos.length === 0 ? (
            <div className="ios-card p-6 text-center">
              <p className="text-[14px] text-[#8E8E93]">
                {isViewingSelf ? '할 일이 없습니다 ✨' : '등록된 업무일지가 없습니다'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {todoGroups.map((group) => (
                <TodoGroup
                  key={group.projectId ?? '__none__'}
                  group={group}
                  memberMap={memberMap}
                  canEdit={isViewingSelf}
                  showReschedule={isPast && isViewingSelf}
                  nextDate={nextDate}
                  profile={profile}
                  onToggle={(id, status) => toggleStatus.mutate({ id, status })}
                  onUpdated={() => refetch()}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── DONE 섹션: 하나의 카드에 전체 목록 + 수정 ── */}
        {dones.length > 0 && (
          <DoneCard
            tasks={dones}
            memberMap={memberMap}
            canEdit={isViewingSelf}
            onToggle={(id, status) => toggleStatus.mutate({ id, status })}
            onUpdated={() => refetch()}
          />
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// TodoGroup: 현장별 그룹 + 개별 카드
// ─────────────────────────────────────────────
function TodoGroup({
  group,
  memberMap,
  canEdit,
  showReschedule,
  nextDate,
  profile,
  onToggle,
  onUpdated,
}: {
  group: TaskGroup
  memberMap: Record<string, string>
  canEdit: boolean
  showReschedule: boolean
  nextDate: string
  profile: any
  onToggle: (id: string, status: string) => void
  onUpdated: () => void
}) {
  const isNone = group.projectId === null
  const doneCount = group.tasks.filter(t => t.status === 'done').length
  const totalCount = group.tasks.length

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        {isNone
          ? <Building2 className="w-4 h-4 text-[#8E8E93]" />
          : <MapPin className="w-4 h-4 text-[#FF9500]" />}
        <span className={cn(
          'text-[13px] font-semibold flex-1',
          isNone ? 'text-[#8E8E93]' : 'text-[#3C3C43]'
        )}>
          {group.projectName}
        </span>
        <span className="text-[11px] text-[#C7C7CC]">{doneCount}/{totalCount}</span>
      </div>

      {/* 하나의 카드에 목록 */}
      <div className="ios-card overflow-hidden">
        {group.tasks.map((task, idx) => (
          <TodoRow
            key={task.id}
            task={task}
            memberMap={memberMap}
            canEdit={canEdit}
            showReschedule={showReschedule}
            nextDate={nextDate}
            profile={profile}
            onToggle={() => onToggle(task.id, task.status)}
            onUpdated={onUpdated}
            isLast={idx === group.tasks.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// TodoRow: Todo 항목 한 행 (인라인 수정 포함)
// ─────────────────────────────────────────────
function TodoRow({
  task,
  memberMap,
  canEdit,
  showReschedule,
  nextDate,
  profile,
  onToggle,
  onUpdated,
  isLast,
}: {
  task: any
  memberMap: Record<string, string>
  canEdit: boolean
  showReschedule: boolean
  nextDate: string
  profile: any
  onToggle: () => void
  onUpdated: () => void
  isLast: boolean
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editImportant, setEditImportant] = useState(task.priority === 'high')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isDone = task.status === 'done'
  const isImportant = task.priority === 'high'
  const [rescheduling, setRescheduling] = useState(false)

  const handleReschedule = async () => {
    setRescheduling(true)
    const supabaseInner = createClient()
    // 이미 다음날에 같은 내용이 있는지 확인
    const { data: existing } = await supabaseInner
      .from('daily_tasks')
      .select('id')
      .eq('company_id', task.company_id)
      .eq('date', nextDate)
      .eq('created_by', task.created_by)
      .eq('title', task.title)
      .limit(1)
    if (existing && existing.length > 0) {
      toast('이미 다음날 일지에 있습니다', { icon: 'ℹ️' })
      setRescheduling(false)
      return
    }
    const { error } = await supabaseInner.from('daily_tasks').insert({
      company_id: task.company_id,
      created_by: task.created_by,
      project_id: task.project_id,
      date: nextDate,
      title: task.title,
      priority: task.priority,
      status: 'todo',
    })
    setRescheduling(false)
    if (error) { toast.error('재등록에 실패했습니다'); return }
    // 다음날 날짜 표시 (MM/DD)
    const [, m, d] = nextDate.split('-')
    toast.success(`${parseInt(m)}/${parseInt(d)}에 재등록했습니다`)
  }

  const handleSave = async () => {
    if (!editTitle.trim()) { toast.error('내용을 입력해주세요'); return }
    setSaving(true)
    const { error } = await supabase
      .from('daily_tasks')
      .update({ title: editTitle.trim(), priority: editImportant ? 'high' : 'normal' })
      .eq('id', task.id)
    setSaving(false)
    if (error) { toast.error('수정에 실패했습니다'); return }
    toast.success('수정되었습니다')
    setEditing(false)
    onUpdated()
  }

  const handleDelete = async () => {
    setSaving(true)
    const { error } = await supabase.from('daily_tasks').delete().eq('id', task.id)
    setSaving(false)
    if (error) { toast.error('삭제에 실패했습니다'); return }
    toast.success('삭제되었습니다')
    setEditing(false)
    onUpdated()
  }

  if (editing) {
    return (
      <div className={cn('px-4 py-3 bg-[#F9F9FF]', !isLast && 'border-b border-black/5')}>
        <div className="flex items-center gap-2 mb-2">
          <ImportantDot
            active={editImportant}
            onToggle={() => setEditImportant(v => !v)}
          />
          <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            className="flex-1 text-[15px] text-black outline-none bg-[#F2F2F7] rounded-xl px-3 py-2"
          />
        </div>
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-[12px] text-[#FF3B30] text-center font-medium">정말 삭제할까요?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[13px] font-medium"
              >취소</button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-[#FF3B30] text-white text-[13px] font-semibold disabled:opacity-40"
              >{saving ? '삭제중...' : '삭제 확인'}</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditTitle(task.title); setEditImportant(task.priority === 'high'); setEditing(false) }}
              className="flex-1 py-2 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[13px] font-medium active:opacity-70"
            >
              취소
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="py-2 px-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px] font-medium active:opacity-70"
            >
              삭제
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-[#007AFF] text-white text-[13px] font-semibold active:opacity-70 disabled:opacity-40"
            >
              {saving ? '저장중...' : '저장'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'px-4 py-3',
      !isLast && 'border-b border-black/5',
      isDone && 'opacity-50'
    )}>
      {/* 한 줄: 체크 + 중요도 + 제목 + 버튼들 (인라인) */}
      <div className="flex items-center gap-3">
        {/* 체크 토글 */}
        <button
          type="button"
          onClick={onToggle}
          className={cn('flex-shrink-0', canEdit ? 'active:scale-90' : 'opacity-50 pointer-events-none')}
        >
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-[#34C759]" />
            : <Circle className="w-5 h-5 text-[#C7C7CC]" />}
        </button>

        {/* 중요도 dot (읽기전용) */}
        <span className="flex-shrink-0">
          <ImportantDot active={isImportant} disabled />
        </span>

        {/* 제목 (canEdit이면 클릭으로 수정 모드 진입) */}
        <p
          onClick={canEdit && !isDone ? () => setEditing(true) : undefined}
          className={cn(
            'flex-1 text-[14px] font-medium leading-snug min-w-0 break-words',
            isDone ? 'line-through text-[#8E8E93]' : 'text-black',
            canEdit && !isDone && 'cursor-pointer active:opacity-60'
          )}
        >
          {task.title}
        </p>

        {/* 인라인 버튼들 (canEdit + 다음날 버튼만) */}
        {canEdit && showReschedule && !isDone && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleReschedule}
              disabled={rescheduling}
              className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-[#FF9500]/12 text-[#FF9500] text-[11px] font-medium active:opacity-60 disabled:opacity-40"
            >
              <CalendarArrowUp className="w-3 h-3" />
              {rescheduling ? '...' : '다음날'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// DoneCard: 완료 항목 전체를 하나의 카드에
//           수정 모드에서 일괄 편집 + 삭제
// ─────────────────────────────────────────────
interface EditRow {
  id: string
  title: string
  important: boolean
  deleted: boolean
}

function DoneCard({
  tasks,
  memberMap,
  canEdit,
  onToggle,
  onUpdated,
}: {
  tasks: any[]
  memberMap: Record<string, string>
  canEdit: boolean
  onToggle: (id: string, status: string) => void
  onUpdated: () => void
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [editRows, setEditRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)

  const enterEdit = () => {
    setEditRows(tasks.map(t => ({
      id: t.id,
      title: t.title,
      important: t.priority === 'high',
      deleted: false,
    })))
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const updateRow = (id: string, patch: Partial<EditRow>) =>
    setEditRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const handleSave = async () => {
    const toDelete = editRows.filter(r => r.deleted).map(r => r.id)
    const toUpdate = editRows.filter(r => !r.deleted && r.title.trim())

    if (toUpdate.length === 0 && toDelete.length < tasks.length) {
      toast.error('내용을 입력해주세요'); return
    }

    setSaving(true)
    try {
      // 삭제
      if (toDelete.length > 0) {
        const { error } = await supabase.from('daily_tasks').delete().in('id', toDelete)
        if (error) throw error
      }
      // 수정
      for (const r of toUpdate) {
        const { error } = await supabase
          .from('daily_tasks')
          .update({ title: r.title.trim(), priority: r.important ? 'high' : 'normal' })
          .eq('id', r.id)
        if (error) throw error
      }
      toast.success('수정되었습니다')
      setEditing(false)
      onUpdated()
    } catch {
      toast.error('수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const visibleRows = editRows.filter(r => !r.deleted)
  const deletedCount = editRows.filter(r => r.deleted).length

  return (
    <div>
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-medium text-[#8E8E93] uppercase tracking-wide">
          Done ({tasks.length})
        </p>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={enterEdit}
            className="px-3 py-1 rounded-lg bg-[#F2F2F7] text-[#007AFF] text-[12px] font-medium active:opacity-60"
          >
            전체 수정
          </button>
        )}
      </div>

      {/* 카드 */}
      <div className="ios-card overflow-hidden">
        {editing ? (
          /* ── 수정 모드 ── */
          <>
            {visibleRows.length === 0 ? (
              <div className="px-4 py-4 text-center text-[14px] text-[#8E8E93]">
                모든 항목이 삭제됩니다
              </div>
            ) : (
              visibleRows.map((row, idx) => (
                <div
                  key={row.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    idx !== visibleRows.length - 1 && 'border-b border-black/5'
                  )}
                >
                  {/* 중요도 토글 */}
                  <ImportantDot
                    active={row.important}
                    onToggle={() => updateRow(row.id, { important: !row.important })}
                  />
                  {/* 제목 입력 */}
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                    className="flex-1 text-[15px] text-black outline-none bg-transparent border-b border-[#007AFF]/30 pb-0.5"
                  />
                  {/* 삭제 버튼 */}
                  <button
                    type="button"
                    onClick={() => updateRow(row.id, { deleted: true })}
                    className="flex-shrink-0 p-1.5 rounded-lg active:opacity-60"
                  >
                    <Trash2 className="w-4 h-4 text-[#FF3B30]" />
                  </button>
                </div>
              ))
            )}

            {/* 저장/취소 버튼 */}
            <div className="flex gap-2 px-4 py-3 border-t border-black/5 bg-[#F9F9FF]">
              <button
                type="button"
                onClick={cancelEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[14px] font-medium active:opacity-70"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#007AFF] text-white text-[14px] font-semibold active:opacity-70 disabled:opacity-40"
              >
                {saving ? '저장중...' : deletedCount > 0 ? `저장 (${deletedCount}개 삭제)` : '저장'}
              </button>
            </div>
          </>
        ) : (
          /* ── 보기 모드 ── */
          tasks.map((task, idx) => (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 opacity-60',
                idx !== tasks.length - 1 && 'border-b border-black/5'
              )}
            >
              {/* 체크 토글 */}
              <button
                type="button"
                onClick={() => onToggle(task.id, task.status)}
                className={cn('flex-shrink-0', canEdit ? 'active:scale-90' : 'pointer-events-none')}
              >
                <CheckCircle2 className="w-5 h-5 text-[#34C759]" />
              </button>

              {/* 중요도 dot */}
              <ImportantDot active={task.priority === 'high'} disabled />

              {/* 제목 */}
              <p className="flex-1 text-[15px] font-medium line-through text-[#8E8E93] min-w-0">
                {task.title}
              </p>

              {/* 작성자 */}
              <span className="flex-shrink-0 flex items-center gap-1 text-[11px] text-[#C7C7CC]">
                <User className="w-3 h-3" />
                {memberMap[task.created_by] ?? ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
