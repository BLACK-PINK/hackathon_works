'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, addDays, subDays, addMonths } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { CashEntrySheet } from '@/components/finance/CashEntrySheet'
import { LoginPopup } from '@/components/dashboard/LoginPopup'
import { Megaphone, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useRef } from 'react'

interface DashboardClientProps {
  profile: any
}

// ─────────────────────────────────────────────
// 역할 한글 표시 헬퍼
// ─────────────────────────────────────────────
function roleLabel(role: string) {
  if (role === 'owner') return '대표'
  if (role === 'manager') return '팀장'
  return ''
}

// ─────────────────────────────────────────────
// 메모 카드 컴포넌트 (localStorage 저장)
// ─────────────────────────────────────────────
function MemoCard({ userId }: { userId: string }) {
  const MEMO_KEY = `dashboard_memo_${userId}`
  const [memo, setMemo] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(MEMO_KEY) || ''
    setMemo(saved)
  }, [MEMO_KEY])

  const handleEdit = () => {
    setDraft(memo)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const handleSave = () => {
    const trimmed = draft.trim()
    localStorage.setItem(MEMO_KEY, trimmed)
    setMemo(trimmed)
    setEditing(false)
  }

  return (
    <div className="ios-card p-4 col-span-2 md:col-span-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[15px] font-bold text-black">메모</p>
        {!editing && (
          <button
            type="button"
            onClick={handleEdit}
            className="px-3 py-1 rounded-lg bg-[#F2F2F7] text-[#007AFF] text-[12px] font-medium active:opacity-60"
          >
            {memo ? '수정' : '작성'}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="메모를 입력하세요..."
            rows={3}
            className="w-full text-[14px] text-black bg-[#F2F2F7] rounded-xl px-3 py-2.5 outline-none resize-none placeholder:text-[#C7C7CC]"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 py-2 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[13px] font-medium active:opacity-70"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2 rounded-xl bg-[#007AFF] text-white text-[13px] font-semibold active:opacity-70"
            >
              저장
            </button>
          </div>
        </>
      ) : (
        <p
          className={cn('text-[14px] leading-relaxed', memo ? 'text-[#3C3C43]' : 'text-[#C7C7CC]')}
          onClick={handleEdit}
        >
          {memo || '탭하여 메모를 입력하세요'}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 공지사항 카드 컴포넌트
// ─────────────────────────────────────────────
function AnnouncementPanel({ profile }: { profile: any }) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const isOwner = profile.role === 'owner'

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── 수정 상태
  const [editTargetId, setEditTargetId] = useState<string | null>(null)

  const openEdit = (a: any) => {
    setEditTargetId(a.id)
    setTitle(a.title)
    setContent(a.content ?? '')
    setIsPinned(a.is_pinned ?? false)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditTargetId(null)
    setTitle(''); setContent(''); setIsPinned(false)
  }

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*, author:user_profiles(name)')
        .eq('company_id', profile.company_id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    staleTime: 0,
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('제목을 입력해주세요')
      const { error } = await supabase.from('announcements').insert({
        company_id: profile.company_id,
        created_by: profile.id,
        title: title.trim(),
        content: content.trim(),
        is_pinned: isPinned,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('공지사항이 등록되었습니다')
      closeForm()
      queryClient.invalidateQueries({ queryKey: ['announcements', profile.company_id] })
    },
    onError: (e: any) => toast.error(e.message || '등록 실패'),
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; title: string; content: string; is_pinned: boolean }) => {
      if (!payload.title.trim()) throw new Error('제목을 입력해주세요')
      const { error } = await supabase.from('announcements').update({
        title: payload.title.trim(),
        content: payload.content.trim(),
        is_pinned: payload.is_pinned,
      }).eq('id', payload.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('수정되었습니다')
      closeForm()
      queryClient.invalidateQueries({ queryKey: ['announcements', profile.company_id] })
    },
    onError: (e: any) => toast.error(e.message || '수정 실패'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('삭제되었습니다')
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['announcements', profile.company_id] })
    },
    onError: () => toast.error('삭제 실패'),
  })

  return (
    <div className="ios-card overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-black/5">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#FF9500]" />
          <p className="text-[15px] font-bold text-black">공지사항</p>
          {announcements.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF9500]/10 text-[#FF9500]">
              {announcements.length}
            </span>
          )}
        </div>
        {isOwner && !showForm && (
          <button
            onClick={() => { setEditTargetId(null); setShowForm(true) }}
            className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[#FF9500]/10 text-[#FF9500] active:opacity-70"
          >
            + 작성
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* 작성/수정 폼 */}
        {showForm && (
          <div className="bg-[#FFF9F0] border border-[#FF9500]/30 rounded-2xl p-4 space-y-3">
            <p className="text-[13px] font-bold text-[#FF9500]">
              {editTargetId ? '📝 공지사항 수정' : '📢 공지사항 작성'}
            </p>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="제목 *"
              className="w-full px-3 py-2.5 bg-white border border-black/8 rounded-xl text-[14px] outline-none"
            />
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="내용 (선택)"
              rows={3}
              className="w-full px-3 py-2.5 bg-white border border-black/8 rounded-xl text-[14px] outline-none resize-none"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={e => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded accent-[#FF9500]"
              />
              <span className="text-[13px] text-[#3C3C43]">📌 상단 고정</span>
            </label>
            <div className="flex gap-2">
              <button onClick={closeForm} className="flex-1 py-2.5 bg-[#F2F2F7] text-[#8E8E93] text-[13px] rounded-xl">취소</button>
              <button
                onClick={() => {
                  // isPinned 값을 클릭 시점에 즉시 로컬 변수로 고정
                  const pinnedSnapshot = isPinned
                  const titleSnapshot = title
                  const contentSnapshot = content
                  if (editTargetId) {
                    updateMutation.mutate({ id: editTargetId, title: titleSnapshot, content: contentSnapshot, is_pinned: pinnedSnapshot })
                  } else {
                    addMutation.mutate()
                  }
                }}
                disabled={addMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2.5 bg-[#FF9500] text-white text-[13px] font-semibold rounded-xl disabled:opacity-40"
              >
                {(addMutation.isPending || updateMutation.isPending)
                  ? (editTargetId ? '수정중...' : '등록중...')
                  : (editTargetId ? '수정' : '등록')}
              </button>
            </div>
          </div>
        )}

        {/* 공지 목록 */}
        {isLoading ? (
          <div className="text-center py-4 text-[#8E8E93] text-[13px]">불러오는 중...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-[13px] text-[#C7C7CC]">등록된 공지사항이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {announcements.map((a: any) => (
              <div
                key={a.id}
                className={cn(
                  'rounded-xl overflow-hidden',
                  a.is_pinned ? 'bg-[#FF9500]/5 border border-[#FF9500]/20' : 'bg-[#F2F2F7]'
                )}
              >
                <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      {a.is_pinned && (
                        <span className="text-[10px] bg-[#FF9500]/15 text-[#FF9500] px-1.5 py-0.5 rounded-full font-semibold">📌 고정</span>
                      )}
                      <p className="text-[14px] font-bold text-[#1C1C1E]">{a.title}</p>
                    </div>
                    {a.content && (
                      <p className="text-[12px] text-[#3C3C43] whitespace-pre-wrap leading-relaxed mt-0.5">{a.content}</p>
                    )}
                    <p className="text-[10px] text-[#C7C7CC] mt-1">
                      {a.author?.name || '알 수 없음'} · {format(new Date(a.created_at), 'M/d HH:mm')}
                    </p>
                  </div>
                  {isOwner && (
                    <div className="flex-shrink-0 mt-0.5">
                      {confirmDeleteId === a.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[11px] px-2 py-1 bg-white text-[#8E8E93] rounded-lg border border-black/8"
                          >취소</button>
                          <button
                            onClick={() => deleteMutation.mutate(a.id)}
                            disabled={deleteMutation.isPending}
                            className="text-[11px] px-2 py-1 bg-[#FF3B30] text-white rounded-lg disabled:opacity-40"
                          >삭제</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {/* 수정 버튼 */}
                          <button
                            onClick={() => openEdit(a)}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-[#007AFF]/10 text-[#007AFF]"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {/* 삭제 버튼 */}
                          <button
                            onClick={() => setConfirmDeleteId(a.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 스케줄러와 동일한 공정 컬러 맵
const PROCESS_COLORS: Record<string, string> = {
  '보양':'#8E8E93','철거':'#FF3B30','바닥철거':'#FF6B35','경량철골':'#636366',
  '금속·창호':'#FF9500','소방':'#FF3B30',
  '설비':'#32ADE6','전기':'#FFD60A','냉난방':'#30B0C7','목작업':'#A2845E',
  '문시공':'#8B6914','필름':'#BF5AF2','타일시공':'#5AC8FA','타일자재':'#4FC3F7',
  '욕실천장':'#30B0C7','탄성코트':'#FF6B35','휴젠트':'#C9A96E',
  '도장':'#FF2D55','도배':'#FF6B9D','마루':'#C9A96E','조명':'#FF9F0A',
  '가구':'#34C759','간판':'#FF9500','실리콘':'#636366','준공청소':'#00C7BE','잔손보기':'#FF9500',
  '홈스타일링':'#BF5AF2','촬영':'#007AFF','오픈하우스':'#34C759','현장미팅':'#007AFF',
  '스케줄 거래처':'#5856D6','현장 스케줄':'#007AFF',
  '계약':'#34C759','기타':'#8E8E93',
}

function getProcessColor(process: string): string {
  return PROCESS_COLORS[process] ?? '#8E8E93'
}

// ─────────────────────────────────────────────
// 스케줄러 카드 (어제/오늘/내일/모레 × 현장)
// ─────────────────────────────────────────────
function SchedulerCard({
  projectList,
  days,
  today,
  onPress,
}: {
  projectList: { projectName: string; cells: Record<string, string[]> }[]
  days: string[]   // [yesterday, today, tomorrow, dayAfterTomorrow]
  today: string
  onPress: () => void
}) {
  const DAY_LABEL: Record<number, string> = { [-1]: '어제', 0: '오늘', 1: '내일', 2: '모레' }
  const todayDate = new Date(today + 'T00:00:00')

  const dayMeta = days.map((d) => {
    const diff = Math.round((new Date(d + 'T00:00:00').getTime() - todayDate.getTime()) / 86400000)
    const label = DAY_LABEL[diff] ?? `+${diff}일`
    const isToday = diff === 0
    const mmdd = d.slice(5).replace('-', '/')
    return { label, isToday, mmdd }
  })

  return (
    <button
      onClick={onPress}
      className="ios-card p-0 text-left active:scale-[0.98] transition-transform overflow-hidden"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-[15px] font-bold text-black">스케줄</p>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] whitespace-nowrap">
          진행 현장 {projectList.length}
        </span>
      </div>

      {/* 날짜 헤더 행 — 4컬럼 */}
      <div className="grid grid-cols-[1fr_52px_52px_52px_52px] border-b border-black/5 px-3 pb-1.5">
        <div />
        {dayMeta.map((dm, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className={cn(
              'text-[10px] font-bold',
              dm.isToday ? 'text-[#007AFF]' : 'text-[#8E8E93]'
            )}>
              {dm.label}
            </span>
            <span className={cn(
              'text-[9px]',
              dm.isToday ? 'text-[#007AFF]/70' : 'text-[#C7C7CC]'
            )}>
              {dm.mmdd}
            </span>
          </div>
        ))}
      </div>

      {/* 현장별 행 (스크롤) */}
      {projectList.length === 0 ? (
        <p className="text-[12px] text-[#C7C7CC] px-4 py-3">4일 내 진행 공정 없음</p>
      ) : (
        <div className="overflow-y-auto max-h-[180px] overscroll-contain">
          {projectList.map((proj, ri) => (
            <div
              key={proj.projectName}
              className={cn(
                'grid grid-cols-[1fr_52px_52px_52px_52px] px-3 py-2',
                ri !== projectList.length - 1 && 'border-b border-black/4'
              )}
            >
              {/* 현장명 */}
              <span className="text-[11px] font-semibold text-[#3C3C43] truncate pr-1 self-start pt-0.5">
                {proj.projectName}
              </span>
              {/* 날짜별 공정 셀 */}
              {days.map((d, di) => (
                <div key={d} className="flex flex-col gap-0.5 items-start">
                  {proj.cells[d].length > 0 ? (
                    proj.cells[d].map((process, ti) => {
                      const color = getProcessColor(process)
                      const isToday = dayMeta[di].isToday
                      return (
                        <span
                          key={ti}
                          style={{
                            backgroundColor: color + (isToday ? '22' : '18'),
                            color: color,
                            borderLeft: `2px solid ${color}`,
                          }}
                          className="text-[8px] font-bold leading-tight px-1 py-0.5 rounded-r"
                        >
                          {process.length > 5 ? process.slice(0, 5) + '…' : process}
                        </span>
                      )
                    })
                  ) : (
                    <span className="text-[10px] text-[#E0E0E0] pl-0.5">—</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="pb-1" />
    </button>
  )
}

// ─────────────────────────────────────────────
// 자금흐름 달력 (대시보드 인라인용)
// ─────────────────────────────────────────────
function DashCalendar({ calMonth, calRevenues, calPayments, calFixedExpenses }: {
  calMonth: Date
  calRevenues: any[]
  calPayments: any[]
  calFixedExpenses: any[]
}) {
  const year  = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const firstDow = firstDay.getDay()
  const totalCells = Math.ceil((firstDow + lastDay.getDate()) / 7) * 7
  const DAY_LABELS = ['일','월','화','수','목','금','토']
  const today = format(new Date(), 'yyyy-MM-dd')
  const monthStr = format(calMonth, 'yyyy-MM')

  type CalEvent = { type: 'revenue' | 'payment' | 'fixed'; amount: number; done?: boolean }
  const eventMap: Record<string, CalEvent[]> = {}
  const addEv = (date: string, ev: CalEvent) => { if (!eventMap[date]) eventMap[date] = []; eventMap[date].push(ev) }

  calRevenues.forEach((r: any) => addEv(r.scheduled_date, { type: 'revenue', amount: Number(r.amount), done: r.is_completed }))
  calPayments.forEach((p: any) => addEv(p.scheduled_date, { type: 'payment', amount: Number(p.amount), done: p.is_completed }))
  calFixedExpenses.forEach((fe: any) => {
    const day = Math.min(Number(fe.billing_day) || 25, lastDay.getDate())
    const dateStr = `${monthStr}-${String(day).padStart(2,'0')}`
    addEv(dateStr, { type: 'fixed', amount: Number(fe.amount) })
  })

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-black/5">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className={cn('text-center py-2 text-[10px] font-bold', i===0?'text-[#FF3B30]':i===6?'text-[#007AFF]':'text-[#8E8E93]')}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - firstDow + 1
          const isValid = dayNum >= 1 && dayNum <= lastDay.getDate()
          if (!isValid) return <div key={idx} className="border-b border-r border-black/4 min-h-[58px]" />
          const dateStr = `${monthStr}-${String(dayNum).padStart(2,'0')}`
          const isToday = dateStr === today
          const dow = idx % 7
          const events = eventMap[dateStr] || []
          return (
            <div key={idx} className={cn('border-b border-r border-black/4 min-h-[58px] p-0.5', idx%7===6&&'border-r-0', isToday&&'bg-[#007AFF]/5')}>
              <div className={cn('text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full mb-0.5 mx-auto',
                isToday?'bg-[#007AFF] text-white':dow===0?'text-[#FF3B30]':dow===6?'text-[#007AFF]':'text-[#1C1C1E]')}>{dayNum}</div>
              <div className="space-y-0.5">
                {events.filter(e=>e.type==='revenue').map((e,ei)=>(
                  <div key={`r${ei}`} className={cn('rounded px-0.5 py-0.5 text-[7px] font-semibold leading-tight',e.done?'bg-[#34C759]/10 text-[#34C759]/50':'bg-[#34C759]/15 text-[#34C759]')}>
                    +{(e.amount/10000).toFixed(0)}만
                  </div>
                ))}
                {events.filter(e=>e.type==='payment').map((e,ei)=>(
                  <div key={`p${ei}`} className={cn('rounded px-0.5 py-0.5 text-[7px] font-semibold leading-tight',e.done?'bg-[#FF3B30]/10 text-[#FF3B30]/50':'bg-[#FF3B30]/15 text-[#FF3B30]')}>
                    -{(e.amount/10000).toFixed(0)}만
                  </div>
                ))}
                {events.filter(e=>e.type==='fixed').map((e,ei)=>(
                  <div key={`f${ei}`} className="rounded px-0.5 py-0.5 text-[7px] font-semibold leading-tight bg-[#FF9500]/15 text-[#FF9500]">
                    -{(e.amount/10000).toFixed(0)}만
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 대시보드
// ─────────────────────────────────────────────
export function DashboardClient({ profile }: DashboardClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
  const today = format(now, 'yyyy-MM-dd')
  const yearStart = format(now, 'yyyy') + '-01-01'
  const yearEnd   = format(now, 'yyyy') + '-12-31'

  const isOwner = profile.role === 'owner'
  const isStaff = !isOwner

  const [showCashEntry, setShowCashEntry] = useState(false)
  const [cashAccount, setCashAccount] = useState<any>(null)
  // 자금흐름 달력 월 선택 (미래 무제한 이동 가능)
  const [calMonth, setCalMonth] = useState(now)
  // 업무일지 날짜 네비게이션
  const [journalDate, setJournalDate] = useState(today)
  const journalDateObj = new Date(journalDate + 'T00:00:00')
  const journalDateStr = format(journalDateObj, 'M/d (EEE)', { locale: ko })
  const isJournalToday = journalDate === today
  // 내일 날짜 계산 (내일 이후로는 이동 불가)
  const tomorrowObj = new Date(now); tomorrowObj.setDate(tomorrowObj.getDate() + 1)
  const tomorrow = format(tomorrowObj, 'yyyy-MM-dd')
  const isJournalTomorrow = journalDate === tomorrow
  const goPrevDay = () => {
    const d = new Date(journalDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    setJournalDate(format(d, 'yyyy-MM-dd'))
  }
  const goNextDay = () => {
    if (isJournalTomorrow) return  // 내일 이후는 막음
    const d = new Date(journalDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    setJournalDate(format(d, 'yyyy-MM-dd'))
  }

  // 현장일지 날짜 네비게이션
  const [siteDate, setSiteDate] = useState(today)
  const siteDateObj = new Date(siteDate + 'T00:00:00')
  const siteDateStr = format(siteDateObj, 'M/d (EEE)', { locale: ko })
  const isSiteToday = siteDate === today
  const isSiteTomorrow = siteDate === tomorrow
  const goPrevSiteDay = () => {
    const d = new Date(siteDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    setSiteDate(format(d, 'yyyy-MM-dd'))
  }
  const goNextSiteDay = () => {
    if (isSiteTomorrow) return
    const d = new Date(siteDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    setSiteDate(format(d, 'yyyy-MM-dd'))
  }

  // ── 날짜/인사 ──
  const dateStr = format(now, 'M월 d일', { locale: ko })
  const dayStr = format(now, 'EEEE', { locale: ko })
  const myRole = roleLabel(profile.role)
  const greeting = `안녕하세요, ${profile.name}${myRole ? ` ${myRole}` : ''}님`

  // ── 회사 구성원 목록 ──
  const { data: members = [] } = useQuery({
    queryKey: ['dashboard-members', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, name, role')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name')
      return data || []
    },
  })

  // ── 업무일지 작성자 (선택된 날짜 기준) ──
  const { data: journalWriters = [] } = useQuery({
    queryKey: ['dashboard-journal-writers', profile.company_id, journalDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_tasks')
        .select('created_by')
        .eq('company_id', profile.company_id)
        .eq('date', journalDate)
      const unique = [...new Set((data || []).map((d: any) => d.created_by))]
      return unique as string[]
    },
  })
  const journalToday = journalWriters.includes(profile.id)

  // ── 현장일지 (선택된 날짜 기준, 프로젝트별 작성자) ──
  const { data: siteLogs = [] } = useQuery({
    queryKey: ['dashboard-site-logs', profile.company_id, siteDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_logs')
        .select('created_by, project_id, projects(id, name)')
        .eq('company_id', profile.company_id)
        .eq('date', siteDate)
      return data || []
    },
  })
  const siteLogProjectIds = [...new Set(siteLogs.map((l: any) => l.project_id).filter(Boolean))]

  // ── 업무전달 현황 (title 포함) ──
  const { data: orders = [] } = useQuery({
    queryKey: ['dashboard-orders', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('work_orders')
        .select('id, title, status')
        .eq('company_id', profile.company_id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
      return data || []
    },
  })
  const ordersActive = orders.filter((o: any) =>
    ['in_progress', 'unconfirmed', 'on_hold'].includes(o.status)
  )
  const ordersActiveCount = ordersActive.length
  const ordersUnconfirmedCount = orders.filter((o: any) => o.status === 'unconfirmed').length
  const ordersDone = orders.filter((o: any) => o.status === 'completed').length

  // 업무전달 상태별 색상/라벨
  const orderStatusDot = (status: string) => {
    if (status === 'unconfirmed') return 'bg-[#FF3B30]'
    if (status === 'on_hold') return 'bg-[#8E8E93]'
    return 'bg-[#FF9500]' // in_progress
  }
  const orderStatusBadge = (status: string) => {
    if (status === 'unconfirmed') return { text: '미확인', cls: 'text-[#FF3B30]' }
    if (status === 'on_hold') return { text: '보류', cls: 'text-[#8E8E93]' }
    return { text: '진행', cls: 'text-[#FF9500]' }
  }

  // ── 진행중 현장 ──
  const { data: projects = [] } = useQuery({
    queryKey: ['dashboard-projects', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, status')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
      return data || []
    },
  })
  const projectsActive = projects.filter((p: any) => p.status === 'active')
  const projectsTotal = projects.length

  // ── 전체 시재 계좌 (멤버별) ──
  const { data: allCashAccounts = [] } = useQuery({
    queryKey: ['dashboard-all-cash', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_accounts')
        .select('id, user_id, name, current_balance')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
      return data || []
    },
  })
  const myCash = allCashAccounts.find((a: any) => a.user_id === profile.id) || null

  // ── A/S 현황: 전체 미처리 목록 (월 무관)
  const { data: asItems = [] } = useQuery({
    queryKey: ['dashboard-as-pending', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('as_records')
        .select('id, content, client_name, site_name, status, received_date, project:projects(name)')
        .eq('company_id', profile.company_id)
        .not('status', 'in', '("completed","cancelled")')
        .order('received_date', { ascending: false })
      return data || []
    },
  })
  const asPendingList = asItems  // 전체가 미처리
  const asPending = asPendingList.length
  const asTotal = asPending

  // ── 이번달 transactions (확정 세전이익 계산용) ──
  const { data: monthTxData } = useQuery({
    queryKey: ['dashboard-month-pl', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('type, category, amount, description, is_internal_transfer')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
      return data || []
    },
    enabled: isOwner,
    staleTime: 5 * 60 * 1000,
  })

  // 이번달 변동판관비
  const { data: recurringVariableTotal = 0 } = useQuery({
    queryKey: ['dashboard-recurring-variable', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('amount')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'variable')
        .eq('is_active', true)
      return (data || []).reduce((s: number, i: any) => s + Number(i.amount), 0)
    },
    enabled: isOwner,
    staleTime: 10 * 60 * 1000,
  })

  // ── 이번달 결제예정 ──
  const { data: payments } = useQuery({
    queryKey: ['dashboard-payments', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, amount, is_completed, scheduled_date')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'payment')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date', { ascending: true })
      return data || []
    },
  })
  const paymentPending = payments?.filter((p: any) => !p.is_completed).length ?? 0
  const paymentPendingAmount = payments
    ?.filter((p: any) => !p.is_completed)
    .reduce((s: number, p: any) => s + Number(p.amount), 0) ?? 0

  // ── 이번달 매출예정 (owner 전용) ──
  const { data: revenues } = useQuery({
    queryKey: ['dashboard-revenues', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      if (!isOwner) return []
      const { data } = await supabase
        .from('cash_flow_schedules')
        .select('id, amount, is_completed, scheduled_date')
        .eq('company_id', profile.company_id)
        .eq('flow_type', 'revenue')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date', { ascending: true })
      return data || []
    },
    enabled: isOwner,
  })
  const revenuePending = revenues?.filter((r: any) => !r.is_completed).length ?? 0
  const revenuePendingAmount = revenues
    ?.filter((r: any) => !r.is_completed)
    .reduce((s: number, r: any) => s + Number(r.amount), 0) ?? 0

  // ── calMonth 기준 달력 쿼리 ──
  const calMonthStart = format(startOfMonth(calMonth), 'yyyy-MM-dd')
  const calMonthEnd   = format(endOfMonth(calMonth), 'yyyy-MM-dd')

  const { data: calRevenues = [] } = useQuery({
    queryKey: ['dash-cal-rev', profile.company_id, calMonthStart, calMonthEnd],
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
    enabled: isOwner,
  })
  const { data: calPayments = [] } = useQuery({
    queryKey: ['dash-cal-pay', profile.company_id, calMonthStart, calMonthEnd],
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
    enabled: isOwner,
  })
  const { data: calFixedExpenses = [] } = useQuery({
    queryKey: ['dash-cal-fixed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount, billing_day')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return data || []
    },
    enabled: isOwner,
    staleTime: 10 * 60 * 1000,
  })

  // ── 변동경비 항목 + 이번달 금액 ──
  const { data: variableItemsList = [] } = useQuery({
    queryKey: ['dash-variable-items', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('id, name, amount')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'variable')
        .eq('is_active', true)
        .order('name')
      return data || []
    },
    enabled: isOwner,
    staleTime: 10 * 60 * 1000,
  })
  const { data: variableTxThisMonth = [] } = useQuery({
    queryKey: ['dash-variable-tx', profile.company_id, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('amount, description')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .eq('category', 'SGA')
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .not('description', 'like', '[정기]%')
      return data || []
    },
    enabled: isOwner,
    staleTime: 5 * 60 * 1000,
  })

  // ── 올해 누적 손익 (대표 전용) ──
  const { data: recurringFixedTotal = 0 } = useQuery({
    queryKey: ['dashboard-recurring-fixed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recurring_expenses')
        .select('amount')
        .eq('company_id', profile.company_id)
        .eq('expense_type', 'fixed')
        .eq('is_active', true)
      return (data || []).reduce((s: number, i: any) => s + Number(i.amount), 0)
    },
    enabled: isOwner,
    staleTime: 10 * 60 * 1000,
  })
  const { data: yearTxData } = useQuery({
    queryKey: ['dashboard-year-pl', profile.company_id, yearStart, yearEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('type, category, amount, description')
        .eq('company_id', profile.company_id)
        .eq('is_voided', false)
        .gte('transaction_date', yearStart)
        .lte('transaction_date', yearEnd)
      return data || []
    },
    enabled: isOwner,
    staleTime: 5 * 60 * 1000,
  })
  const currentMonthNum  = now.getMonth() + 1  // 1~12
  const yearRevenue      = (yearTxData || []).filter((t: any) => t.category === 'REVENUE').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const yearCogs         = (yearTxData || []).filter((t: any) => t.category === 'COGS').reduce((s: number, t: any) => s + Number(t.amount), 0)
  // 고정 판관비: recurring 월금액 × 현재 개월 수 / 변동 판관비: 직접 입력 비정기 SGA 실적
  const yearSgaFixed     = recurringFixedTotal * currentMonthNum
  const yearSgaVariable  = (yearTxData || []).filter((t: any) => t.category === 'SGA' && !t.description?.startsWith('[정기]')).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const yearSga          = yearSgaFixed + yearSgaVariable
  const yearPretax       = yearRevenue - yearCogs - yearSga
  const yearPretaxRate   = yearRevenue > 0 ? Math.round((yearPretax / yearRevenue) * 100) : 0

  // ── 이번달 세전이익 (확정) ──
  // 확정 = 완료된 매출(REVENUE) - 원장상 모든 지출(COGS+기타expense) - 고정판관비(월) - 변동판관비(월)
  const monthTxFiltered = (monthTxData || []).filter((t: any) => !t.is_internal_transfer)
  const monthConfirmedRevenue  = monthTxFiltered.filter((t: any) => t.category === 'REVENUE').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthConfirmedCogs     = monthTxFiltered.filter((t: any) => t.category === 'COGS').reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthConfirmedSgaFixed = monthTxFiltered.filter((t: any) => t.category === 'SGA' && t.description?.startsWith('[정기]')).reduce((s: number, t: any) => s + Number(t.amount), 0)
  const monthConfirmedSgaVar   = monthTxFiltered.filter((t: any) => t.category === 'SGA' && !t.description?.startsWith('[정기]')).reduce((s: number, t: any) => s + Number(t.amount), 0)
  // 고정판관비 확정: recurring 월 금액 (실제 지출 여부와 무관하게 발생 비용으로 처리)
  const monthFixedSga          = recurringFixedTotal  // 월 고정판관비
  const monthVariableSga       = recurringVariableTotal + monthConfirmedSgaVar  // 유동판관비
  const monthConfirmedPretax   = monthConfirmedRevenue - monthConfirmedCogs - monthFixedSga - monthVariableSga

  // ── 이번달 세전이익 (예정) ──
  // 예정 = 전체 매출예정(미완료) - 전체 결제예정(미완료) - 판관비
  const monthSga               = monthFixedSga + monthVariableSga
  const monthProjectedPretax   = revenuePendingAmount - paymentPendingAmount - monthSga

  // ── 스케줄러: 어제/오늘/내일 3일치 공정 ──
  const yesterday    = format(subDays(now, 1), 'yyyy-MM-dd')
  const tomorrowStr  = format(addDays(now, 1), 'yyyy-MM-dd')
  const dayAfterStr  = format(addDays(now, 2), 'yyyy-MM-dd')   // 모레

  const { data: scheduleRows = [] } = useQuery({
    queryKey: ['dashboard-schedules', profile.company_id, yesterday, dayAfterStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedules')
        .select('id, project_id, process, start_date, end_date, date, row_type')
        .eq('company_id', profile.company_id)
        .eq('row_type', 'process')
        .lte('start_date', dayAfterStr)           // 시작일이 모레 이하
        .or(`end_date.gte.${yesterday},end_date.is.null`)  // 종료일이 어제 이후 or 하루짜리
      return data || []
    },
    staleTime: 2 * 60 * 1000,
  })

  // 현장별 × 날짜별 공정 매핑 (어제/오늘/내일/모레 4일)
  const scheduleDays = [yesterday, today, tomorrowStr, dayAfterStr]
  const scheduleByProject: Record<string, { projectName: string; cells: Record<string, string[]> }> = {}
  projectsActive.forEach((p: any) => {
    scheduleByProject[p.id] = {
      projectName: p.name,
      cells: { [yesterday]: [], [today]: [], [tomorrowStr]: [], [dayAfterStr]: [] },
    }
  })
  scheduleRows.forEach((s: any) => {
    if (!scheduleByProject[s.project_id]) return
    const start = s.start_date || s.date
    const end   = s.end_date   || s.start_date || s.date  // end_date null → 하루짜리
    if (!start) return
    scheduleDays.forEach((d) => {
      if (start <= d && d <= end) {
        scheduleByProject[s.project_id].cells[d].push(s.process || '공정')
      }
    })
  })
  // 4일 내 공정이 하나라도 있는 현장만 표시
  const scheduleProjectList = projectsActive
    .map((p: any) => scheduleByProject[p.id])
    .filter((p) => p && scheduleDays.some((d) => p.cells[d].length > 0))

  // ── 현장일지: active 현장별 작성 여부 ──
  const siteLogByProject = projectsActive.map((p: any) => ({
    id: p.id,
    name: p.name,
    wrote: siteLogProjectIds.includes(p.id),
  }))

  // ── 시재: 멤버별 잔액 매핑 ──
  const cashByMember = members.map((m: any) => {
    const acc = allCashAccounts.find((a: any) => a.user_id === m.id)
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      isMe: m.id === profile.id,
      balance: acc ? Number(acc.current_balance) : null,
      accountRaw: acc || null,
    }
  })

  // ─────────────────────────────────────────────
  // 공통 카드 내부: 이름+상태 행 렌더러
  // wrote=true → 초록 "작성" / false → 주황 "미작성"
  // ─────────────────────────────────────────────
  const MemberStatusRow = ({
    label,
    wrote,
    color,
    statusText,
  }: {
    label: string
    wrote: boolean
    color?: string
    statusText?: string
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#3C3C43] truncate flex-1">{label}</span>
      <span className={cn(
        'text-[10px] font-bold ml-2 flex-shrink-0',
        color ?? (wrote ? 'text-[#34C759]' : 'text-[#FF9500]')
      )}>
        {statusText ?? (wrote ? '작성' : '미작성')}
      </span>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-[#F2F2F7]">

      {/* ── 로그인 팝업 ── */}
      <LoginPopup profile={profile} />

      {/* ── 헤더 — 모바일: 풀 블루 헤더 / PC: 작은 상단 바 ── */}
      <div className="bg-[#007AFF] px-5 pt-14 pb-7 md:pt-6 md:pb-5">
        <p className="text-white/70 text-[13px] font-medium">{dateStr} {dayStr}</p>
        <p className="text-white text-[22px] font-bold mt-1 md:text-[18px]">{greeting} 👋</p>
        <p className="text-white/60 text-[13px] mt-0.5 md:hidden">{profile.company?.name}</p>
      </div>

      {/* ── 카드 영역 ── */}
      <div className="px-4 py-4 pb-8 md:px-6 md:py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">

          {/* ══════════════════════════════════════
              팀장/직원 대시보드
              행1: [스케줄러 (col-span-2)]
              행2: 업무일지 | 현장일지
              행3~: 나머지 유지
          ══════════════════════════════════════ */}
          {isStaff && (
            <>
              {/* ── 행0: 공지사항 + 스케줄 — 모바일 전체너비 / PC 2열 ── */}
              <div className="col-span-2 md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <AnnouncementPanel profile={profile} />
                <SchedulerCard
                  projectList={scheduleProjectList}
                  days={scheduleDays}
                  today={today}
                  onPress={() => router.push('/scheduler')}
                />
              </div>

              {/* ── 행1-좌: 업무일지 — 날짜 네비게이션 포함 ── */}
              <div className="ios-card p-4 flex flex-col">
                <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                  <button onClick={() => router.push('/journal/task')} className="text-[17px] font-bold text-black active:opacity-70">업무일지</button>
                  <span className={cn(
                    'text-[11px] font-bold px-1 py-0.5 rounded-full whitespace-nowrap',
                    journalToday ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF9500]/15 text-[#FF9500]'
                  )}>
                    {journalToday ? '작성 ✓' : '미작성'}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goPrevDay} className="text-[#007AFF] text-[13px] font-semibold px-1.5 py-0.5 active:opacity-60">‹ 전날</button>
                  <span className={cn(
                    'text-[13px] font-semibold',
                    isJournalToday ? 'text-[#007AFF]' : isJournalTomorrow ? 'text-[#34C759]' : 'text-[#8E8E93]'
                  )}>
                    {journalDateStr}{isJournalToday ? ' (오늘)' : isJournalTomorrow ? ' (내일)' : ''}
                  </span>
                  <button
                    onClick={goNextDay}
                    className={cn(
                      'text-[13px] font-semibold px-1.5 py-0.5',
                      isJournalTomorrow ? 'text-[#C7C7CC]' : 'text-[#007AFF] active:opacity-60'
                    )}
                    disabled={isJournalTomorrow}
                  >
                    다음 ›
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {members.map((m: any) => {
                    const wrote = journalWriters.includes(m.id)
                    const isMe = m.id === profile.id
                    const lbl = roleLabel(m.role)
                    return (
                      <button
                        key={m.id}
                        onClick={() => router.push(`/journal/task?date=${journalDate}&userId=${m.id}`)}
                        className="w-full text-left active:opacity-60"
                      >
                        <MemberStatusRow
                          label={`${m.name}${lbl}${isMe ? ' (나)' : ''}`}
                          wrote={wrote}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── 행1-우: 현장일지 — 날짜 네비게이션 포함 ── */}
              <div className="ios-card p-4 flex flex-col">
                <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                  <button onClick={() => router.push('/journal/site')} className="text-[17px] font-bold text-black active:opacity-70">현장일지</button>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                    작성 {siteLogByProject.filter(p => p.wrote).length} / 전체 {siteLogByProject.length}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goPrevSiteDay} className="text-[#007AFF] text-[13px] font-semibold px-1.5 py-0.5 active:opacity-60">‹ 전날</button>
                  <span className={cn(
                    'text-[13px] font-semibold',
                    isSiteToday ? 'text-[#007AFF]' : isSiteTomorrow ? 'text-[#34C759]' : 'text-[#8E8E93]'
                  )}>
                    {siteDateStr}{isSiteToday ? ' (오늘)' : isSiteTomorrow ? ' (내일)' : ''}
                  </span>
                  <button
                    onClick={goNextSiteDay}
                    className={cn(
                      'text-[13px] font-semibold px-1.5 py-0.5',
                      isSiteTomorrow ? 'text-[#C7C7CC]' : 'text-[#007AFF] active:opacity-60'
                    )}
                    disabled={isSiteTomorrow}
                  >
                    다음 ›
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {siteLogByProject.length > 0 ? (
                    siteLogByProject.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => router.push(`/journal/site?date=${siteDate}&projectId=${p.id}`)}
                        className="w-full text-left active:opacity-60"
                      >
                        <MemberStatusRow label={p.name} wrote={p.wrote} />
                      </button>
                    ))
                  ) : (
                    <p className="text-[12px] text-[#C7C7CC]">진행중인 현장 없음</p>
                  )}
                </div>
              </div>

              {/* 3. 업무전달 */}
              <button
                onClick={() => router.push('/orders')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-center justify-between mb-2 min-h-[24px]">
                  <p className="text-[17px] font-bold text-black">업무전달</p>
                  <div className="flex items-center gap-0.5 flex-nowrap">
                    {ordersUnconfirmedCount > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                        미확인 {ordersUnconfirmedCount}
                      </span>
                    )}
                    {ordersActiveCount > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] whitespace-nowrap">
                        진행 {ordersActiveCount}
                      </span>
                    )}
                    {ordersDone > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] whitespace-nowrap">
                        완료 {ordersDone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {ordersActive.slice(0, 4).map((o: any) => {
                    const badge = orderStatusBadge(o.status)
                    return (
                      <div key={o.id} className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', orderStatusDot(o.status))} />
                        <span className="text-[13px] text-[#3C3C43] truncate flex-1">{o.title}</span>
                        <span className={cn('text-[11px] font-bold flex-shrink-0', badge.cls)}>{badge.text}</span>
                      </div>
                    )
                  })}
                  {ordersActiveCount === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">진행중인 업무 없음</p>
                  )}
                  {ordersActiveCount > 4 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {ordersActiveCount - 4}건</span>
                  )}
                </div>
              </button>

              {/* 4. A/S */}
              <button
                onClick={() => router.push('/as')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <div>
                    <p className="text-[17px] font-bold text-black">A/S</p>
                    <p className="text-[10px] text-[#8E8E93]">미처리 전체</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-nowrap">
                    {asPending > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                        미완료 {asPending}
                      </span>
                    )}
                    <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                      전체 {asTotal}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {asPendingList.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#FF3B30] flex-shrink-0" />
                      <span className="text-[13px] text-[#3C3C43] truncate">
                        {a.site_name || (a.project as any)?.name || a.client_name || a.content || 'A/S'}
                      </span>
                    </div>
                  ))}
                  {asPending === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">미처리 A/S 없음</p>
                  )}
                  {asPending > 4 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {asPending - 4}건</span>
                  )}
                </div>
              </button>

              {/* 5. 현장 */}
              <button
                onClick={() => router.push('/projects')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <p className="text-[17px] font-bold text-black">현장</p>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] whitespace-nowrap">
                    진행 {projectsActive.length}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {projectsActive.slice(0, 4).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#FF9500] flex-shrink-0" />
                      <span className="text-[13px] text-[#3C3C43] truncate">{p.name}</span>
                    </div>
                  ))}
                  {projectsActive.length === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">진행중인 현장 없음</p>
                  )}
                  {projectsActive.length > 4 && (
                    <span className="text-[13px] text-[#8E8E93] mt-0.5">외 {projectsActive.length - 4}개</span>
                  )}
                </div>
              </button>

              {/* 6. 시재 */}
              <div
                className="ios-card p-4 text-left cursor-pointer active:scale-[0.97] transition-transform flex flex-col"
                onClick={() => router.push('/finance/dashboard?tab=cash')}
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <p className="text-[17px] font-bold text-black">시재</p>
                  {myCash && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCashAccount(myCash); setShowCashEntry(true) }}
                      className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] active:opacity-70 whitespace-nowrap"
                    >
                      + 기입
                    </button>
                  )}
                </div>
                {myCash ? (
                  <p className={cn('text-[14px] font-bold', Number(myCash.current_balance) >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]')}>
                    {Number(myCash.current_balance).toLocaleString()}원
                  </p>
                ) : (
                  <p className="text-[12px] text-[#8E8E93]">재무에서 등록</p>
                )}
              </div>

              {/* 7. 결제예정 (팀장/직원용 col-span-2) */}
              <button
                onClick={() => router.push('/finance/dashboard?tab=payment-schedule')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform col-span-2 md:col-span-1 flex flex-col"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[17px] font-bold text-black">결제예정</p>
                  {paymentPending > 0 && (
                    <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                      {paymentPending}건
                    </span>
                  )}
                </div>
                {paymentPending > 0 && (
                  <p className="text-[18px] font-bold text-[#FF3B30] mb-2">
                    -{paymentPendingAmount.toLocaleString()}원
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {payments?.filter((p: any) => !p.is_completed).slice(0, 3).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="text-[13px] text-[#8E8E93]">
                        {p.scheduled_date ? p.scheduled_date.slice(5,7).replace(/^0/,'') + '/' + p.scheduled_date.slice(8,10).replace(/^0/,'') : '-'}
                      </span>
                      <span className="text-[13px] font-bold text-[#FF3B30]">
                        -{Number(p.amount).toLocaleString()}원
                      </span>
                    </div>
                  ))}
                  {paymentPending === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">결제예정 없음</p>
                  )}
                  {paymentPending > 3 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {paymentPending - 3}건</span>
                  )}
                </div>
              </button>

              {/* 8. 메모 */}
              <MemoCard userId={profile.id} />
            </>
          )}

          {/* ══════════════════════════════════════
              대표(owner) 대시보드
              행0: [스케줄러 (col-span-2)]
              행1: 업무일지 | 현장일지
              행2: 업무전달 | A/S
              행3: 현장     | 시재
              행4: 매출예정 | 결제예정
              행5: 올해 누적 세전이익
              행6: 메모 (전체너비)
          ══════════════════════════════════════ */}
          {isOwner && (
            <>
              {/* ── 행0: 공지사항 + 스케줄 — 모바일 전체너비 / PC 2열 ── */}
              <div className="col-span-2 md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <AnnouncementPanel profile={profile} />
                <SchedulerCard
                  projectList={scheduleProjectList}
                  days={scheduleDays}
                  today={today}
                  onPress={() => router.push('/scheduler')}
                />
              </div>

              {/* 행1-좌: 업무일지 — 날짜 네비게이션 포함 */}
              <div className="ios-card p-4 flex flex-col">
                {/* 헤더: 제목 + 작성 현황 뱃지 */}
                <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                  <button onClick={() => router.push('/journal/task')} className="text-[17px] font-bold text-black active:opacity-70">업무일지</button>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                    {journalWriters.length}/{members.length}
                  </span>
                </div>
                {/* 날짜 네비게이션 */}
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goPrevDay} className="text-[#007AFF] text-[13px] font-semibold px-1.5 py-0.5 active:opacity-60">‹ 전날</button>
                  <span className={cn(
                    'text-[13px] font-semibold',
                    isJournalToday ? 'text-[#007AFF]' : isJournalTomorrow ? 'text-[#34C759]' : 'text-[#8E8E93]'
                  )}>
                    {journalDateStr}{isJournalToday ? ' (오늘)' : isJournalTomorrow ? ' (내일)' : ''}
                  </span>
                  <button
                    onClick={goNextDay}
                    className={cn(
                      'text-[13px] font-semibold px-1.5 py-0.5',
                      isJournalTomorrow ? 'text-[#C7C7CC]' : 'text-[#007AFF] active:opacity-60'
                    )}
                    disabled={isJournalTomorrow}
                  >
                    다음 ›
                  </button>
                </div>
                {/* 멤버별 작성 현황 */}
                <div className="flex flex-col gap-1">
                  {members.map((m: any) => {
                    const wrote = journalWriters.includes(m.id)
                    const isMe = m.id === profile.id
                    const lbl = roleLabel(m.role)
                    return (
                      <button
                        key={m.id}
                        onClick={() => router.push(`/journal/task?date=${journalDate}&userId=${m.id}`)}
                        className="w-full text-left active:opacity-60"
                      >
                        <MemberStatusRow
                          label={`${m.name}${lbl}${isMe ? ' (나)' : ''}`}
                          wrote={wrote}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 행1-우: 현장일지 — 날짜 네비게이션 포함 */}
              <div className="ios-card p-4 flex flex-col">
                {/* 헤더: 제목 + 건수뱃지 */}
                <div className="flex items-center justify-between mb-1.5 min-h-[24px]">
                  <button onClick={() => router.push('/journal/site')} className="text-[17px] font-bold text-black active:opacity-70">현장일지</button>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                    작성 {siteLogByProject.filter(p => p.wrote).length} / 전체 {siteLogByProject.length}
                  </span>
                </div>
                {/* 날짜 네비게이션 */}
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goPrevSiteDay} className="text-[#007AFF] text-[13px] font-semibold px-1.5 py-0.5 active:opacity-60">‹ 전날</button>
                  <span className={cn(
                    'text-[13px] font-semibold',
                    isSiteToday ? 'text-[#007AFF]' : isSiteTomorrow ? 'text-[#34C759]' : 'text-[#8E8E93]'
                  )}>
                    {siteDateStr}{isSiteToday ? ' (오늘)' : isSiteTomorrow ? ' (내일)' : ''}
                  </span>
                  <button
                    onClick={goNextSiteDay}
                    className={cn(
                      'text-[13px] font-semibold px-1.5 py-0.5',
                      isSiteTomorrow ? 'text-[#C7C7CC]' : 'text-[#007AFF] active:opacity-60'
                    )}
                    disabled={isSiteTomorrow}
                  >
                    다음 ›
                  </button>
                </div>
                {/* 현장별 작성 현황 */}
                <div className="flex flex-col gap-1">
                  {siteLogByProject.length > 0 ? (
                    siteLogByProject.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => router.push(`/journal/site?date=${siteDate}&projectId=${p.id}`)}
                        className="w-full text-left active:opacity-60"
                      >
                        <MemberStatusRow label={p.name} wrote={p.wrote} />
                      </button>
                    ))
                  ) : (
                    <p className="text-[13px] text-[#C7C7CC]">진행중인 현장 없음</p>
                  )}
                </div>
              </div>

              {/* 행2-좌: 업무전달 — 진행중 제목 리스트 + 상태별 색상 */}
              <button
                onClick={() => router.push('/orders')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-center justify-between mb-2 min-h-[24px]">
                  <p className="text-[17px] font-bold text-black">업무전달</p>
                  <div className="flex items-center gap-0.5 flex-nowrap">
                    {ordersUnconfirmedCount > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                        미확인 {ordersUnconfirmedCount}
                      </span>
                    )}
                    {ordersActiveCount > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] whitespace-nowrap">
                        진행 {ordersActiveCount}
                      </span>
                    )}
                    {ordersDone > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] whitespace-nowrap">
                        완료 {ordersDone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {ordersActive.slice(0, 4).map((o: any) => {
                    const badge = orderStatusBadge(o.status)
                    return (
                      <div key={o.id} className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', orderStatusDot(o.status))} />
                        <span className="text-[13px] text-[#3C3C43] truncate flex-1">{o.title}</span>
                        <span className={cn('text-[11px] font-bold flex-shrink-0', badge.cls)}>{badge.text}</span>
                      </div>
                    )
                  })}
                  {ordersActiveCount === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">진행중인 업무 없음</p>
                  )}
                  {ordersActiveCount > 4 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {ordersActiveCount - 4}건</span>
                  )}
                </div>
              </button>

              {/* 행2-우: A/S — 미완료 리스트 */}
              <button
                onClick={() => router.push('/as')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <div>
                    <p className="text-[17px] font-bold text-black">A/S</p>
                    <p className="text-[10px] text-[#8E8E93]">미처리 전체</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-nowrap">
                    {asPending > 0 && (
                      <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                        미완료 {asPending}
                      </span>
                    )}
                    <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                      전체 {asTotal}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {asPendingList.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#FF3B30] flex-shrink-0" />
                      <span className="text-[13px] text-[#3C3C43] truncate">
                        {a.site_name || (a.project as any)?.name || a.client_name || a.content || 'A/S'}
                      </span>
                    </div>
                  ))}
                  {asPending === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">미처리 A/S 없음</p>
                  )}
                  {asPending > 4 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {asPending - 4}건</span>
                  )}
                </div>
              </button>

              {/* 행3-좌: 현장 — 현장명 리스트 */}
              <button
                onClick={() => router.push('/projects')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <p className="text-[17px] font-bold text-black">현장</p>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] whitespace-nowrap">
                    진행 {projectsActive.length}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {projectsActive.slice(0, 4).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[#FF9500] flex-shrink-0" />
                      <span className="text-[13px] text-[#3C3C43] truncate">{p.name}</span>
                    </div>
                  ))}
                  {projectsActive.length === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">진행중인 현장 없음</p>
                  )}
                  {projectsActive.length > 4 && (
                    <span className="text-[13px] text-[#8E8E93] mt-0.5">외 {projectsActive.length - 4}개</span>
                  )}
                </div>
              </button>

              {/* 행3-우: 시재 — 멤버별 잔액 + 기입 버튼을 헤더 우측에 */}
              <div
                className="ios-card p-4 text-left cursor-pointer active:scale-[0.97] transition-transform flex flex-col"
                onClick={() => router.push('/finance/dashboard?tab=cash')}
              >
                <div className="flex items-start justify-between mb-2 min-h-[36px]">
                  <p className="text-[17px] font-bold text-black">시재</p>
                  {/* 내 계좌의 + 기입 버튼을 헤더 우측에 배치 */}
                  {myCash && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCashAccount(myCash); setShowCashEntry(true) }}
                      className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] active:opacity-70 whitespace-nowrap"
                    >
                      + 기입
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {cashByMember.filter(m => m.balance !== null).map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <span className="text-[13px] text-[#3C3C43] truncate flex-1">
                        {m.name}{roleLabel(m.role)}{m.isMe ? ' (나)' : ''}
                      </span>
                      <span className={cn(
                        'text-[13px] font-bold ml-2 flex-shrink-0',
                        m.balance! >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'
                      )}>
                        {m.balance!.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {cashByMember.filter(m => m.balance !== null).length === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">등록된 시재 없음</p>
                  )}
                </div>
              </div>

              {/* 행4-좌: 매출예정 */}
              <button
                onClick={() => router.push('/finance/dashboard?tab=revenue-schedule')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[17px] font-bold text-black">매출예정</p>
                  {revenuePending > 0 && (
                    <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] whitespace-nowrap">
                      {revenuePending}건
                    </span>
                  )}
                </div>
                {revenuePending > 0 && (
                  <p className="text-[18px] font-bold text-[#34C759] mb-2">
                    +{revenuePendingAmount.toLocaleString()}원
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {revenues?.filter((r: any) => !r.is_completed).slice(0, 3).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className="text-[13px] text-[#8E8E93]">
                        {r.scheduled_date ? r.scheduled_date.slice(5,7).replace(/^0/,'') + '/' + r.scheduled_date.slice(8,10).replace(/^0/,'') : '-'}
                      </span>
                      <span className="text-[13px] font-bold text-[#34C759]">
                        +{Number(r.amount).toLocaleString()}원
                      </span>
                    </div>
                  ))}
                  {revenuePending === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">매출예정 없음</p>
                  )}
                  {revenuePending > 3 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {revenuePending - 3}건</span>
                  )}
                </div>
              </button>

              {/* 행4-우: 결제예정 */}
              <button
                onClick={() => router.push('/finance/dashboard?tab=payment-schedule')}
                className="ios-card p-4 text-left active:scale-[0.97] transition-transform flex flex-col"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[17px] font-bold text-black">결제예정</p>
                  {paymentPending > 0 && (
                    <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] whitespace-nowrap">
                      {paymentPending}건
                    </span>
                  )}
                </div>
                {paymentPending > 0 && (
                  <p className="text-[18px] font-bold text-[#FF3B30] mb-2">
                    -{paymentPendingAmount.toLocaleString()}원
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {payments?.filter((p: any) => !p.is_completed).slice(0, 3).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="text-[13px] text-[#8E8E93]">
                        {p.scheduled_date ? p.scheduled_date.slice(5,7).replace(/^0/,'') + '/' + p.scheduled_date.slice(8,10).replace(/^0/,'') : '-'}
                      </span>
                      <span className="text-[13px] font-bold text-[#FF3B30]">
                        -{Number(p.amount).toLocaleString()}원
                      </span>
                    </div>
                  ))}
                  {paymentPending === 0 && (
                    <p className="text-[13px] text-[#C7C7CC]">결제예정 없음</p>
                  )}
                  {paymentPending > 3 && (
                    <span className="text-[13px] text-[#8E8E93]">외 {paymentPending - 3}건</span>
                  )}
                </div>
              </button>

              {/* 행5: 이번달 세전이익 (확정 + 예정) — col-span-2, 대표 전용 */}
              <button
                onClick={() => router.push('/finance/dashboard?tab=company-pl')}
                className="ios-card p-4 text-left col-span-2 md:col-span-3 active:scale-[0.97] transition-transform"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[17px] font-bold text-black">이번달 세전이익</p>
                  <span className="text-[11px] font-bold px-1 py-0.5 rounded-full bg-[#8E8E93]/15 text-[#8E8E93] whitespace-nowrap">
                    {format(now, 'M월', { locale: ko })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* 확정 */}
                  <div className="bg-[#F2F2F7] rounded-xl p-3">
                    <p className="text-[13px] text-[#8E8E93] font-medium mb-1">확정</p>
                    <p className={cn(
                      'text-[17px] font-bold',
                      monthConfirmedPretax >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'
                    )}>
                      {monthConfirmedPretax >= 0 ? '+' : ''}{monthConfirmedPretax.toLocaleString()}원
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">매출</span>
                        <span className="text-[10px] font-medium text-[#34C759]">+{monthConfirmedRevenue.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">원가</span>
                        <span className="text-[10px] font-medium text-[#FF3B30]">-{monthConfirmedCogs.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">판관비</span>
                        <span className="text-[10px] font-medium text-[#FF3B30]">-{(monthFixedSga + monthVariableSga).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  {/* 예정 */}
                  <div className="bg-[#F2F2F7] rounded-xl p-3">
                    <p className="text-[13px] text-[#8E8E93] font-medium mb-1">예정</p>
                    <p className={cn(
                      'text-[17px] font-bold',
                      monthProjectedPretax >= 0 ? 'text-[#007AFF]' : 'text-[#FF3B30]'
                    )}>
                      {monthProjectedPretax >= 0 ? '+' : ''}{monthProjectedPretax.toLocaleString()}원
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">매출예정</span>
                        <span className="text-[10px] font-medium text-[#34C759]">+{revenuePendingAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">결제예정</span>
                        <span className="text-[10px] font-medium text-[#FF3B30]">-{paymentPendingAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#8E8E93]">판관비</span>
                        <span className="text-[10px] font-medium text-[#FF3B30]">-{monthSga.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {/* 행6: 올해 누적 세전이익 카드 (col-span-2, 대표 전용) */}
              <button
                onClick={() => router.push('/finance/dashboard?tab=company-pl')}
                className="ios-card p-4 text-left col-span-2 md:col-span-3 active:scale-[0.97] transition-transform"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[17px] font-bold text-black">올해 누적 세전이익</p>
                  <span className={cn(
                    'text-[11px] font-bold px-1 py-0.5 rounded-full whitespace-nowrap',
                    yearPretaxRate >= 0 ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF3B30]/15 text-[#FF3B30]'
                  )}>
                    수익률 {yearPretaxRate}%
                  </span>
                </div>
                <p className={cn(
                  'text-[22px] font-bold mb-2',
                  yearPretax >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'
                )}>
                  {yearPretax >= 0 ? '+' : ''}{yearPretax.toLocaleString()}원
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[#8E8E93]">
                    매출 <span className="font-semibold text-[#3C3C43]">{yearRevenue.toLocaleString()}</span>
                  </span>
                  <span className="text-[10px] text-[#C7C7CC]">·</span>
                  <span className="text-[10px] text-[#8E8E93]">
                    원가 <span className="font-semibold text-[#3C3C43]">-{yearCogs.toLocaleString()}</span>
                  </span>
                  <span className="text-[10px] text-[#C7C7CC]">·</span>
                  <span className="text-[10px] text-[#8E8E93]">
                    고정판관비 <span className="font-semibold text-[#3C3C43]">-{yearSgaFixed.toLocaleString()}</span>
                  </span>
                  <span className="text-[10px] text-[#C7C7CC]">·</span>
                  <span className="text-[10px] text-[#8E8E93]">
                    변동판관비 <span className="font-semibold text-[#3C3C43]">-{yearSgaVariable.toLocaleString()}</span>
                  </span>
                </div>
              </button>

              {/* 행6: 메모 (전체너비) */}
              <MemoCard userId={profile.id} />
            </>
          )}

        </div>
      </div>

      {/* 시재 기입 Sheet */}
      {cashAccount && (
        <CashEntrySheet
          open={showCashEntry}
          onClose={() => setShowCashEntry(false)}
          account={cashAccount}
          profile={profile}
        />
      )}
    </div>
  )
}
