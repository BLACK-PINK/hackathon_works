'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Calendar, Share2, Edit2, X, ChevronLeft, ChevronRight, Phone, MessageSquare, AlertTriangle, ChevronDown } from 'lucide-react'

/* ══════════════════════════════════════════════
   상수
══════════════════════════════════════════════ */
const PROCESS_COLORS: Record<string, string> = {
  '보양':'#8E8E93','철거':'#FF3B30','바닥철거':'#FF6B35','경량철골':'#636366',
  '금속·창호':'#FF9500','소방':'#FF3B30',
  '설비':'#32ADE6','전기':'#FFD60A','냉난방':'#30B0C7','목작업':'#A2845E',
  '문시공':'#8B6914','필름':'#BF5AF2','타일시공':'#5AC8FA','타일자재':'#4FC3F7',
  '욕실천장':'#30B0C7','탄성코트':'#FF6B35','휴젠트':'#C9A96E',
  '도장':'#FF2D55','도배':'#FF6B9D','마루':'#C9A96E','조명':'#FF9F0A',
  '가구':'#34C759','간판':'#FF9500','실리콘':'#636366','준공청소':'#00C7BE','잔손보기':'#FF9500',
  '도기시공':'#5AC8FA','방수':'#32ADE6','현장정리':'#00C7BE','가전설치':'#007AFF','폐기물반출':'#FF6B35',
  '중문시공':'#636366','거울시공':'#30B0C7','금속':'#FF9500',
  '홈스타일링':'#BF5AF2','촬영':'#007AFF','오픈하우스':'#34C759','현장미팅':'#007AFF',
  '스케줄 거래처':'#5856D6','현장 스케줄':'#007AFF',
  '계약':'#34C759','기타':'#8E8E93',
}
const PROCESSES = Object.keys(PROCESS_COLORS)

// 챕터 할일 뱃지 목록
const TASK_BADGES = [
  { label: '미팅',       color: '#007AFF' },
  { label: '현장미팅',   color: '#5856D6' },
  { label: '마감재미팅', color: '#AF52DE' },
  { label: '자재발주',   color: '#FF9500' },
  { label: '현장체크',   color: '#32ADE6' },
  { label: '제안서완료', color: '#34C759' },
]

// 행 구성: 공정 5행 + 챕터할일 3행 = 8행
const PROCESS_ROWS = [0, 1, 2, 3, 4]
const TASK_ROWS   = [5, 6, 7]

/* ══════════════════════════════════════════════
   날짜 유틸
══════════════════════════════════════════════ */
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fromYMD(s: string) {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate()+n); return r
}
function addMonths(d: Date, n: number) {
  const r = new Date(d); r.setMonth(r.getMonth()+n); return r
}
const DAY_KO = ['일','월','화','수','목','금','토']
function isSat(d: Date) { return d.getDay() === 6 }
function isSun(d: Date) { return d.getDay() === 0 }

function buildDateRange(center: Date, before=30, after=90): Date[] {
  return Array.from({length: before+after+1}, (_,i) => addDays(center, i-before))
}

// 날짜 문자열에 요일 붙이기 (예: "2026-08-06" → "2026-08-06(목)")
function formatDateWithDay(ymd: string) {
  const d = fromYMD(ymd)
  return `${ymd}(${DAY_KO[d.getDay()]})`
}

// 월의 첫날
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/* ══════════════════════════════════════════════
   행 옵션 (+ 버튼용)
══════════════════════════════════════════════ */
const ROW_OPTIONS = [
  { label: '공정 1행', value: 0, type: 'process' },
  { label: '공정 2행', value: 1, type: 'process' },
  { label: '공정 3행', value: 2, type: 'process' },
  { label: '공정 4행', value: 3, type: 'process' },
  { label: '공정 5행', value: 4, type: 'process' },
  { label: '할일 1행', value: 5, type: 'task' },
  { label: '할일 2행', value: 6, type: 'task' },
  { label: '할일 3행', value: 7, type: 'task' },
]

/* ══════════════════════════════════════════════
   공통 Sheet 스타일
══════════════════════════════════════════════ */
const inputCls = 'w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]'
const labelCls = 'text-[11px] text-[#8E8E93] font-medium mb-1 block'

/* ══════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════ */
interface Props { profile: any }

export function SchedulerPageClient({ profile }: Props) {
  const supabase    = createClient()
  const queryClient = useQueryClient()
  const canManage   = profile.role === 'owner' || profile.role === 'manager'
  const isOwner     = profile.role === 'owner'
  const todayRef    = useRef<HTMLTableCellElement>(null)
  const gridRef     = useRef<HTMLDivElement>(null)

  // PC 마우스 드래그 스크롤 상태
  const isDragging   = useRef(false)
  const dragStartX   = useRef(0)
  const dragStartY   = useRef(0)
  const scrollStartX = useRef(0)
  const scrollStartY = useRef(0)

  const today    = new Date(); today.setHours(0,0,0,0)
  const todayStr = toYMD(today)

  // 현재 보고 있는 월 기준점 (좌우 이동용)
  const [viewCenter, setViewCenter] = useState(today)
  const dates     = buildDateRange(viewCenter, 30, 90)
  const rangeStart = toYMD(dates[0])
  const rangeEnd   = toYMD(dates[dates.length-1])

  // 현재 월 표시용
  const viewMonthLabel = `${viewCenter.getFullYear()}년 ${viewCenter.getMonth()+1}월`

  // Sheet 상태
  const [addSheet,    setAddSheet]    = useState(false)
  const [detailSheet, setDetailSheet] = useState(false)
  const [editSheet,   setEditSheet]   = useState(false)
  const [shareSheet,  setShareSheet]  = useState(false)

  const [selectedCell,      setSelectedCell]      = useState<{projectId:string; rowIndex:number; date:string}|null>(null)
  const [selectedSchedule,  setSelectedSchedule]  = useState<any|null>(null)
  const [savedFormForShare, setSavedFormForShare] = useState<any|null>(null)

  // 날짜 이동 선택 모달
  const [moveModeModal, setMoveModeModal] = useState<{days: number} | null>(null)

  // ── 현장별 스케줄 전체 삭제 (owner 전용)
  const [deleteProjectModal, setDeleteProjectModal] = useState(false)
  const [deleteProjectId, setDeleteProjectId]       = useState('')
  const [deleteConfirmText, setDeleteConfirmText]   = useState('')
  const [deleteStep, setDeleteStep]                 = useState<1|2>(1) // 1:현장선택, 2:최종확인

  // 오늘로 스크롤
  useEffect(() => {
    setTimeout(() => {
      todayRef.current?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
    }, 300)
  }, [])

  // ── 현장 목록
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-scheduler', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, access_code, unit_password')
        .eq('company_id', profile.company_id)
        .neq('status', '완료')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })

  // ── 거래처 목록 (담당업체 선택용)
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-scheduler', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, phone, process')
        .eq('company_id', profile.company_id)
        .order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 60_000,
  })

  // ── 커스텀 공정 조회 (거래처 페이지에서 추가된 공정 반영)
  const { data: customProcessNames = [] } = useQuery({
    queryKey: ['company_processes_scheduler', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_processes')
        .select('name')
        .eq('company_id', profile.company_id)
        .order('created_at')
      if (error) {
        console.warn('company_processes 조회 실패:', error.message)
        return []
      }
      return (data || []).map((r: any) => r.name as string)
    },
    staleTime: 30_000,
  })

  // 전체 공정 목록 = PROCESS_COLORS 키 + 커스텀 공정 (중복 제거)
  const allProcessNames: string[] = [
    ...PROCESSES,
    ...customProcessNames.filter((p: string) => !PROCESSES.includes(p)),
  ]

  // ── 스케줄 조회
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules-v2', profile.company_id, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('company_id', profile.company_id)
        .or(`start_date.gte.${rangeStart},date.gte.${rangeStart}`)
        .or(`end_date.lte.${rangeEnd},date.lte.${rangeEnd}`)
      if (error) throw error
      return data || []
    },
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  })

  // ── 마우스 드래그 스크롤 핸들러 (PC)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 우클릭 무시, 실제 셀 클릭(td)은 드래그 시작하지 않음
    if (e.button !== 0) return
    const el = gridRef.current
    if (!el) return
    isDragging.current   = true
    dragStartX.current   = e.clientX
    dragStartY.current   = e.clientY
    scrollStartX.current = el.scrollLeft
    scrollStartY.current = el.scrollTop
    el.style.cursor      = 'grabbing'
    el.style.userSelect  = 'none'
    e.preventDefault()
  }
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const el = gridRef.current
    if (!el) return
    const dx = e.clientX - dragStartX.current
    const dy = e.clientY - dragStartY.current
    el.scrollLeft = scrollStartX.current - dx
    el.scrollTop  = scrollStartY.current - dy
  }
  const handleMouseUpOrLeave = () => {
    if (!isDragging.current) return
    isDragging.current = false
    const el = gridRef.current
    if (!el) return
    el.style.cursor     = 'grab'
    el.style.userSelect = ''
  }
  // 드래그 중 셀 클릭 방지 (mousedown → mousemove 5px 이상이면 드래그로 간주)
  const dragMoved = useRef(false)
  const handleMouseDownGrid = (e: React.MouseEvent<HTMLDivElement>) => {
    dragMoved.current = false
    handleMouseDown(e)
  }
  const handleMouseMoveGrid = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      const dx = Math.abs(e.clientX - dragStartX.current)
      const dy = Math.abs(e.clientY - dragStartY.current)
      if (dx > 4 || dy > 4) dragMoved.current = true
    }
    handleMouseMove(e)
  }

  const refresh = () => queryClient.invalidateQueries({
    queryKey: ['schedules-v2', profile.company_id, rangeStart, rangeEnd],
  })

  // ── 저장
  const saveMutation = useMutation({
    mutationFn: async (form: any) => {
      if (form.id) {
        const { error } = await supabase.from('schedules').update({
          process: form.process, worker_name: form.worker_name,
          memo: form.memo, color: form.color,
          start_date: form.start_date, end_date: form.end_date,
          row_type: form.row_type, date: form.start_date,
        }).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('schedules').insert({
          company_id: profile.company_id,
          created_by: profile.id,
          project_id: form.project_id,
          date: form.start_date,
          start_date: form.start_date,
          end_date: form.end_date,
          row_index: form.row_index,
          row_type: form.row_type,
          process: form.process,
          worker_name: form.worker_name,
          memo: form.memo,
          color: form.color,
          status: '예정',
        })
        if (error) throw error
      }
      return form
    },
    onSuccess: (form: any) => {
      refresh()
      setAddSheet(false); setEditSheet(false); setDetailSheet(false)
      setSelectedCell(null); setSelectedSchedule(null)
      setSavedFormForShare(form)
      setShareSheet(true)
    },
    onError: (e: any) => toast.error(e.message || '저장 실패'),
  })

  // ── 날짜 이동 (이 공정만)
  const moveDateMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const s = selectedSchedule
      if (!s) return
      const newStart = toYMD(addDays(fromYMD(s.start_date || s.date), days))
      const newEnd   = toYMD(addDays(fromYMD(s.end_date   || s.date), days))

      // ── 겹침 감지: 같은 project_id에서 newStart~newEnd 날짜 범위에 겹치는 공정 확인
      // 이동 후 같은 row_index 셀에 다른 공정이 있으면 row_index를 빈 행으로 자동 조정
      const { data: sameProject } = await supabase
        .from('schedules')
        .select('id, start_date, end_date, date, row_index')
        .eq('project_id', s.project_id)
        .neq('id', id) // 자기 자신 제외
      
      let newRowIndex = s.row_index ?? 0
      if (sameProject && sameProject.length > 0) {
        // 이동할 날짜 범위와 겹치는 공정들 찾기
        const newStartD = fromYMD(newStart)
        const newEndD   = fromYMD(newEnd)
        
        // row별로 어떤 날짜에 공정이 있는지 맵핑
        const rowOccupied: Record<number, Set<string>> = {}
        sameProject.forEach((sc: any) => {
          const ri = sc.row_index ?? 0
          if (!rowOccupied[ri]) rowOccupied[ri] = new Set()
          const scStart = fromYMD(sc.start_date || sc.date)
          const scEnd   = fromYMD(sc.end_date   || sc.date)
          let cur = new Date(scStart)
          while (cur <= scEnd) {
            rowOccupied[ri].add(toYMD(cur))
            cur = addDays(cur, 1)
          }
        })
        
        // newStart~newEnd 날짜 목록
        const movingDates: string[] = []
        let cur = new Date(newStartD)
        while (cur <= newEndD) { movingDates.push(toYMD(cur)); cur = addDays(cur, 1) }
        
        // 현재 row에서 겹치면 → 다음 빈 row 찾기 (0~7 범위)
        const hasConflict = (rowIdx: number) =>
          movingDates.some(d => rowOccupied[rowIdx]?.has(d))
        
        if (hasConflict(newRowIndex)) {
          // 겹치지 않는 가장 낮은 row 탐색
          for (let r = 0; r <= 7; r++) {
            if (!hasConflict(r)) { newRowIndex = r; break }
          }
        }
      }

      const updatePayload: any = { start_date: newStart, end_date: newEnd, date: newStart }
      if (newRowIndex !== (s.row_index ?? 0)) updatePayload.row_index = newRowIndex

      const { error } = await supabase.from('schedules').update(updatePayload).eq('id', id)
      if (error) throw error
      setSelectedSchedule((prev: any) => ({
        ...prev, start_date: newStart, end_date: newEnd, date: newStart, row_index: newRowIndex,
      }))
      return { newStart, newEnd, newRowIndex }
    },
    onSuccess: (res: any) => {
      const moved = res?.newRowIndex !== undefined && res.newRowIndex !== (selectedSchedule?.row_index ?? 0)
      toast.success(moved ? `날짜 이동 + ${res.newRowIndex + 1}행으로 이동했습니다` : '이 공정 날짜를 이동했습니다')
      refresh()
    },
    onError: () => toast.error('날짜 이동 실패'),
  })

  // ── 날짜 이동 (이후 공정 모두)
  const moveAllAfterMutation = useMutation({
    mutationFn: async ({ days }: { days: number }) => {
      const s = selectedSchedule
      if (!s) return
      const thisStart = s.start_date || s.date
      // 같은 프로젝트에서 이 공정 시작일 이후(≥) 스케줄 모두 조회
      const { data: afterSchedules, error: fetchErr } = await supabase
        .from('schedules')
        .select('id, start_date, end_date, date')
        .eq('project_id', s.project_id)
        .gte('start_date', thisStart)
      if (fetchErr) throw fetchErr
      if (!afterSchedules || afterSchedules.length === 0) return
      // 각각 업데이트
      for (const sc of afterSchedules) {
        const sd = sc.start_date || sc.date
        const ed = sc.end_date   || sc.date
        const newStart = toYMD(addDays(fromYMD(sd), days))
        const newEnd   = toYMD(addDays(fromYMD(ed), days))
        const { error } = await supabase.from('schedules').update({
          start_date: newStart, end_date: newEnd, date: newStart,
        }).eq('id', sc.id)
        if (error) throw error
      }
      // selectedSchedule도 업데이트
      const newStart = toYMD(addDays(fromYMD(thisStart), days))
      const newEnd   = toYMD(addDays(fromYMD(s.end_date || s.date), days))
      setSelectedSchedule((prev: any) => ({ ...prev, start_date: newStart, end_date: newEnd, date: newStart }))
      return afterSchedules.length
    },
    onSuccess: (count) => { toast.success(`이후 공정 ${count}개를 모두 이동했습니다`); refresh() },
    onError: () => toast.error('날짜 이동 실패'),
  })

  // 날짜 이동 모드 선택 함수
  const handleMoveDateRequest = (days: number) => {
    setMoveModeModal({ days })
  }

  // ── 개별 삭제
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('schedules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('삭제됐습니다'); refresh()
      setDetailSheet(false); setSelectedSchedule(null)
    },
    onError: () => toast.error('삭제 실패'),
  })

  // ── 현장별 전체 삭제 (owner 전용)
  const deleteByProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('project_id', projectId)
        .eq('company_id', profile.company_id)
      if (error) throw error
    },
    onSuccess: () => {
      const proj = projects.find((p: any) => p.id === deleteProjectId)
      toast.success(`${proj?.name || '현장'} 스케줄이 전체 삭제되었습니다`)
      refresh()
      setDeleteProjectModal(false)
      setDeleteProjectId('')
      setDeleteConfirmText('')
      setDeleteStep(1)
    },
    onError: () => toast.error('삭제에 실패했습니다'),
  })

  // 스케줄 맵
  const scheduleMap: Record<string, any> = {}
  schedules.forEach((s: any) => {
    const sd = s.start_date || s.date
    const ed = s.end_date   || s.date
    if (!sd || !ed) return
    let cur = fromYMD(sd)
    const end = fromYMD(ed)
    while (cur <= end) {
      const key = `${s.project_id}__${s.row_index ?? 0}__${toYMD(cur)}`
      scheduleMap[key] = s
      cur = addDays(cur, 1)
    }
  })

  // 셀 클릭
  const handleCellClick = (projectId: string, rowIndex: number, dateStr: string) => {
    if (dragMoved.current) return // 드래그 중 클릭 무시
    if (!canManage) return
    const existing = scheduleMap[`${projectId}__${rowIndex}__${dateStr}`]
    if (existing) {
      setSelectedSchedule(existing)
      setDetailSheet(true)
    } else {
      setSelectedCell({ projectId, rowIndex, date: dateStr })
      setAddSheet(true)
    }
  }

  // 공유 메시지 생성 (날짜 요일 + 비밀번호 포함)
  const buildShareText = (s: any) => {
    const proj = projects.find((p: any) => p.id === s.project_id)
    const sd = s.start_date ?? s.date
    const ed = s.end_date ?? s.date
    const dateStr = sd === ed
      ? formatDateWithDay(sd)
      : `${formatDateWithDay(sd)} ~ ${formatDateWithDay(ed)}`
    return [
      `📋 ${proj?.name ?? '현장'}`,
      `공정: ${s.process}`,
      `기간: ${dateStr}`,
      s.worker_name ? `담당: ${s.worker_name}` : '',
      s.memo ? `메모: ${s.memo}` : '',
      proj?.access_code ? `🔑 공동현관: ${proj.access_code}` : '',
      proj?.unit_password ? `🏠 세대현관: ${proj.unit_password}` : '',
      '📞 일정 조정 필요시 연락 부탁드립니다',
    ].filter(Boolean).join('\n')
  }

  // 공유
  const handleShare = (s: any) => {
    const proj = projects.find((p: any) => p.id === s.project_id)
    const text = buildShareText(s)
    if (navigator.share) navigator.share({ title: proj?.name, text })
    else { navigator.clipboard.writeText(text); toast.success('클립보드에 복사됐습니다') }
  }

  // 월 이동
  const goPrevMonth = () => setViewCenter(v => addMonths(v, -1))
  const goNextMonth = () => setViewCenter(v => addMonths(v, +1))
  const goToday     = () => {
    setViewCenter(today)
    setTimeout(() => todayRef.current?.scrollIntoView({ inline:'center', behavior:'smooth', block:'nearest' }), 100)
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">

      {/* ── 컨트롤 바 */}
      <div className="bg-white border-b border-black/5 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        {/* 월 이동 */}
        <button onClick={goPrevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-black/5">
          <ChevronLeft className="w-4 h-4 text-[#3C3C43]" />
        </button>
        <button onClick={goToday}
          className="flex-1 text-center text-[13px] font-semibold text-[#1C1C1E] py-1 rounded-lg active:bg-black/5">
          {viewMonthLabel}
        </button>
        <button onClick={goNextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center active:bg-black/5">
          <ChevronRight className="w-4 h-4 text-[#3C3C43]" />
        </button>
        {/* 오늘로 */}
        <button onClick={goToday}
          className="text-[12px] text-[#007AFF] font-medium px-2.5 py-1 bg-[#007AFF]/8 rounded-full active:opacity-60 ml-1 flex-shrink-0">
          오늘로
        </button>
        {/* 현장/일정 수 */}
        <span className="text-[11px] text-[#8E8E93] flex-shrink-0">
          {projects.length}현장 · {isLoading ? '…' : `${schedules.length}건`}
        </span>
        {/* 현장 스케줄 전체 삭제 버튼 (owner 전용) */}
        {isOwner && (
          <button
            onClick={() => { setDeleteStep(1); setDeleteProjectId(''); setDeleteConfirmText(''); setDeleteProjectModal(true) }}
            className="w-7 h-7 bg-[#FF3B30]/10 rounded-full flex items-center justify-center active:opacity-70 flex-shrink-0"
            title="현장 스케줄 삭제"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" />
          </button>
        )}
        {/* + 버튼 */}
        {canManage && (
          <button
            onClick={() => { setSelectedCell(null); setAddSheet(true) }}
            className="w-7 h-7 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70 flex-shrink-0">
            <Plus className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>

      {/* 현장 없을 때 안내 */}
      {projects.length === 0 && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="text-5xl">🏗️</span>
          <p className="text-[16px] font-semibold text-[#1C1C1E]">현장이 없습니다</p>
          <p className="text-[13px] text-[#8E8E93]">
            현장 탭에서 현장을 먼저 등록하면<br/>여기서 공정 스케줄을 관리할 수 있어요
          </p>
        </div>
      )}

      {/* ══ 그리드 ══ */}
      {projects.length > 0 && (
        <div
          ref={gridRef}
          className="flex-1 overflow-auto select-none"
          style={{ WebkitOverflowScrolling: 'touch', cursor: 'grab' }}
          onMouseDown={handleMouseDownGrid}
          onMouseMove={handleMouseMoveGrid}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        >
          <table className="border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>

            {/* 날짜 헤더 */}
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 bg-[#1C3557] border-b border-r border-white/10 text-white"
                  style={{ minWidth: 68, width: 68 }}
                >
                  <div className="px-1.5 py-2 text-[10px] font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3" />현장
                  </div>
                </th>

                {dates.map((d) => {
                  const ymd = toYMD(d)
                  const isToday = ymd === todayStr
                  const sat = isSat(d), sun = isSun(d)
                  return (
                    <th
                      key={ymd}
                      ref={isToday ? todayRef : undefined}
                      className={cn(
                        'sticky top-0 z-20 border-b border-r border-black/8 text-center',
                        isToday ? 'bg-[#007AFF]' : sat ? 'bg-[#EBF4FF]' : sun ? 'bg-[#FFF0F0]' : 'bg-white'
                      )}
                      style={{ minWidth: 48, width: 48 }}
                    >
                      <div className="py-1 flex flex-col items-center gap-0">
                        <span className={cn(
                          'text-[9px] font-medium',
                          isToday ? 'text-white/80' : sun ? 'text-[#FF3B30]' : sat ? 'text-[#007AFF]' : 'text-[#8E8E93]'
                        )}>
                          {DAY_KO[d.getDay()]}
                        </span>
                        <span className={cn(
                          'text-[13px] font-bold',
                          isToday ? 'text-white' : sun ? 'text-[#FF3B30]' : sat ? 'text-[#007AFF]' : 'text-black'
                        )}>
                          {d.getDate()}
                        </span>
                        {d.getDate() === 1 && (
                          <span className={cn('text-[8px]', isToday ? 'text-white/70' : 'text-[#8E8E93]')}>
                            {d.getMonth()+1}월
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {projects.map((project: any, pIdx: number) => {
                const darkBg  = pIdx % 2 === 0 ? '#1C3557' : '#243F63'
                const lightBg = pIdx % 2 === 0 ? '#F8F9FA' : '#F3F5F7'

                return (
                  <>
                    {/* ── 공정 행 5개 (현장명 rowSpan=5) ── */}
                    {PROCESS_ROWS.map((rowIdx) => (
                      <tr key={`${project.id}-p${rowIdx}`}>
                        {/* 현장명: 공정 5행만 합치기 */}
                        {rowIdx === 0 && (
                          <td
                            rowSpan={5}
                            className="sticky left-0 z-10 border-r border-black/10 align-middle"
                            style={{ minWidth: 68, width: 68, backgroundColor: darkBg }}
                          >
                            <div className="px-1.5 py-2 text-center">
                              <span className="text-[11px] font-bold text-white/50 leading-tight block">
                                {pIdx+1}
                              </span>
                              <span className="text-[10px] font-bold text-white leading-tight mt-0.5 block"
                                style={{ wordBreak:'keep-all', overflowWrap:'break-word' }}>
                                {project.name.length > 8 ? project.name.slice(0,8)+'…' : project.name}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 날짜별 공정 셀 */}
                        {dates.map((d) => {
                          const ymd = toYMD(d)
                          const key = `${project.id}__${rowIdx}__${ymd}`
                          const s   = scheduleMap[key]
                          const isToday = ymd === todayStr
                          const isStart = s && ((s.start_date || s.date) === ymd)

                          const sat = isSat(d), sun = isSun(d)
                          const isWeekend = sat || sun
                          // 주말엔 시작일인 일정만 표시 (중간/종료일은 숨김)
                          const showSchedule = !!s && (!isWeekend || isStart)
                          return (
                            <td key={ymd}
                              onClick={() => handleCellClick(project.id, rowIdx, ymd)}
                              className={cn(
                                'border-b border-r p-0 transition-colors',
                                isToday ? 'border-r-[#007AFF]/60 bg-[#007AFF]/10' : sat ? 'border-r-black/6 bg-[#EBF4FF]/60' : sun ? 'border-r-black/6 bg-[#FFF0F0]/60' : 'border-r-black/6',
                                isToday ? 'border-b-[#007AFF]/20' : 'border-b-black/6',
                                canManage ? 'cursor-pointer active:bg-black/5' : ''
                              )}
                              style={{ minWidth: 48, width: 48, height: 26, boxShadow: isToday ? 'inset 2px 0 0 #007AFF, inset -2px 0 0 #007AFF' : undefined }}
                            >
                              {showSchedule && (
                                <div className="h-full flex items-center px-0.5"
                                  style={{
                                    backgroundColor: isStart ? `${s.color}CC` : `${s.color}55`,
                                    borderLeft: isStart ? `3px solid ${s.color}` : 'none',
                                  }}>
                                  {isStart && (
                                    <span className="text-[9px] font-bold text-white truncate leading-none px-0.5">
                                      {s.process}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}

                    {/* ── 공정/할일 구분선 ── */}
                    <tr key={`${project.id}-div`}>
                      <td
                        colSpan={dates.length + 1}
                        style={{ height: 1, backgroundColor: '#CBD5E0', padding: 0 }}
                      />
                    </tr>

                    {/* ── 챕터할일 행 3개 (흰색 배경, "챕터 할일" 텍스트 rowSpan=3) ── */}
                    {TASK_ROWS.map((rowIdx) => (
                      <tr key={`${project.id}-t${rowIdx}`}>
                        {/* 챕터할일 레이블: 할일 3행만 합치기 */}
                        {rowIdx === TASK_ROWS[0] && (
                          <td
                            rowSpan={3}
                            className="sticky left-0 z-10 border-r border-black/10 align-middle"
                            style={{ minWidth: 68, width: 68, backgroundColor: '#FFFFFF' }}
                          >
                            <div className="px-1 py-1 text-center">
                              <span className="text-[9px] font-bold text-[#8E8E93] leading-tight block"
                                style={{ writingMode: 'horizontal-tb' }}>
                                챕터<br/>할일
                              </span>
                            </div>
                          </td>
                        )}

                        {dates.map((d) => {
                          const ymd = toYMD(d)
                          const key = `${project.id}__${rowIdx}__${ymd}`
                          const s   = scheduleMap[key]
                          const isToday = ymd === todayStr
                          const isStart = s && ((s.start_date || s.date) === ymd)
                          const isLastTaskRow = rowIdx === TASK_ROWS[TASK_ROWS.length-1]

                          const sat = isSat(d), sun = isSun(d)
                          const isWeekend = sat || sun
                          // 주말엔 시작일인 일정만 표시 (중간/종료일은 숨김)
                          const showSchedule = !!s && (!isWeekend || isStart)
                          return (
                            <td key={ymd}
                              onClick={() => handleCellClick(project.id, rowIdx, ymd)}
                              className={cn(
                                'border-r p-0 transition-colors',
                                isLastTaskRow ? 'border-b border-b-[#CBD5E0]' : 'border-b border-b-black/5',
                                isToday ? 'border-r-[#007AFF]/60 bg-[#007AFF]/10' : sat ? 'border-r-black/6 bg-[#EBF4FF]/60' : sun ? 'border-r-black/6 bg-[#FFF0F0]/60' : 'border-r-black/6',
                                canManage ? 'cursor-pointer active:bg-black/5' : ''
                              )}
                              style={{ minWidth: 48, width: 48, height: 22, boxShadow: isToday ? 'inset 2px 0 0 #007AFF, inset -2px 0 0 #007AFF' : undefined }}
                            >
                              {showSchedule && (
                                <div className="h-full flex items-center px-0.5"
                                  style={{
                                    backgroundColor: isStart ? `${s.color}99` : `${s.color}33`,
                                    borderLeft: isStart ? `3px solid ${s.color}` : 'none',
                                  }}>
                                  {isStart && (
                                    <span className="text-[8px] font-bold text-white truncate leading-none px-0.5">
                                      {s.process}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ Sheets ══ */}
      <AddScheduleSheet
        open={addSheet}
        onClose={() => { setAddSheet(false); setSelectedCell(null) }}
        cellInfo={selectedCell}
        projects={projects}
        vendors={vendors}
        isSaving={saveMutation.isPending}
        onSave={(form) => saveMutation.mutate(form)}
        allProcessNames={allProcessNames}
        onProcessAdded={() => queryClient.invalidateQueries({ queryKey: ['company_processes_scheduler'] })}
      />

      <DetailSheet
        open={detailSheet}
        onClose={() => { setDetailSheet(false); setSelectedSchedule(null) }}
        schedule={selectedSchedule}
        projects={projects}
        canManage={canManage}
        isDeleting={deleteMutation.isPending}
        isMoving={moveDateMutation.isPending || moveAllAfterMutation.isPending}
        onEdit={() => { setDetailSheet(false); setEditSheet(true) }}
        onDelete={(id) => deleteMutation.mutate(id)}
        onShare={handleShare}
        buildShareText={buildShareText}
        onMoveDate={(id, days) => handleMoveDateRequest(days)}
      />

      {/* ══ 날짜 이동 모드 선택 모달 ══ */}
      {moveModeModal && selectedSchedule && (
        <MoveModeModal
          days={moveModeModal.days}
          schedule={selectedSchedule}
          isMoving={moveDateMutation.isPending || moveAllAfterMutation.isPending}
          onMoveOnly={() => {
            moveDateMutation.mutate({ id: selectedSchedule.id, days: moveModeModal.days })
            setMoveModeModal(null)
          }}
          onMoveAll={() => {
            moveAllAfterMutation.mutate({ days: moveModeModal.days })
            setMoveModeModal(null)
          }}
          onClose={() => setMoveModeModal(null)}
        />
      )}

      <EditScheduleSheet
        open={editSheet}
        onClose={() => { setEditSheet(false); setSelectedSchedule(null) }}
        schedule={selectedSchedule}
        vendors={vendors}
        isSaving={saveMutation.isPending}
        onSave={(form) => saveMutation.mutate(form)}
        allProcessNames={allProcessNames}
        onProcessAdded={() => queryClient.invalidateQueries({ queryKey: ['company_processes_scheduler'] })}
      />

      {/* ══ 저장 후 공유 Sheet ══ */}
      <SavedShareSheet
        open={shareSheet}
        onClose={() => { setShareSheet(false); setSavedFormForShare(null) }}
        form={savedFormForShare}
        projects={projects}
        vendors={vendors}
      />

      {/* ══ 현장별 스케줄 전체 삭제 모달 (owner 전용) ══ */}
      {deleteProjectModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setDeleteProjectModal(false); setDeleteStep(1); setDeleteProjectId(''); setDeleteConfirmText('') }} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* 헤더 */}
            <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-black/5">
              <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#FF3B30]" />
              </div>
              <div>
                <p className="text-[17px] font-bold text-black">현장 스케줄 삭제</p>
                <p className="text-[12px] text-[#8E8E93] mt-0.5">
                  {deleteStep === 1 ? '삭제할 현장을 선택하세요' : '최종 확인'}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">

              {deleteStep === 1 && (
                <>
                  {/* 현장 선택 드롭다운 */}
                  <div>
                    <p className="text-[12px] font-medium text-[#8E8E93] mb-1.5">현장 선택</p>
                    <div className="relative">
                      <select
                        value={deleteProjectId}
                        onChange={(e) => setDeleteProjectId(e.target.value)}
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none pr-8"
                      >
                        <option value="">-- 현장을 선택하세요 --</option>
                        {projects.map((p: any) => {
                          const cnt = schedules.filter((s: any) => s.project_id === p.id).length
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({cnt}건)
                            </option>
                          )
                        })}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                    </div>
                  </div>

                  {/* 선택된 현장 스케줄 미리보기 */}
                  {deleteProjectId && (() => {
                    const proj = projects.find((p: any) => p.id === deleteProjectId)
                    const cnt  = schedules.filter((s: any) => s.project_id === deleteProjectId).length
                    return (
                      <div className="bg-[#FF3B30]/5 border border-[#FF3B30]/20 rounded-xl px-4 py-3">
                        <p className="text-[13px] font-semibold text-[#FF3B30]">⚠️ {proj?.name}</p>
                        <p className="text-[12px] text-[#FF3B30]/80 mt-1">
                          스케줄 <span className="font-bold">{cnt}건</span>이 <span className="font-bold">완전히 삭제</span>됩니다.
                        </p>
                        <p className="text-[11px] text-[#8E8E93] mt-1">
                          현장별 스케줄 캘린더에서도 동시에 삭제됩니다.
                        </p>
                      </div>
                    )
                  })()}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setDeleteProjectModal(false); setDeleteStep(1); setDeleteProjectId('') }}
                      className="flex-1 py-3 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[15px] font-medium active:opacity-70"
                    >
                      취소
                    </button>
                    <button
                      disabled={!deleteProjectId}
                      onClick={() => setDeleteStep(2)}
                      className="flex-1 py-3 rounded-xl bg-[#FF3B30] text-white text-[15px] font-semibold active:opacity-70 disabled:opacity-40"
                    >
                      다음
                    </button>
                  </div>
                </>
              )}

              {deleteStep === 2 && (() => {
                const proj = projects.find((p: any) => p.id === deleteProjectId)
                const cnt  = schedules.filter((s: any) => s.project_id === deleteProjectId).length
                return (
                  <>
                    <div className="bg-[#FF3B30]/5 border border-[#FF3B30]/30 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-[14px] font-bold text-[#FF3B30]">정말 삭제하시겠습니까?</p>
                      <p className="text-[13px] text-black">현장: <span className="font-semibold">{proj?.name}</span></p>
                      <p className="text-[13px] text-black">삭제 건수: <span className="font-bold text-[#FF3B30]">{cnt}건</span></p>
                      <p className="text-[12px] text-[#8E8E93] pt-1">이 작업은 되돌릴 수 없습니다.</p>
                    </div>

                    {/* 재확인 입력 */}
                    <div>
                      <p className="text-[12px] font-medium text-[#8E8E93] mb-1.5">
                        확인을 위해 아래에 <span className="text-[#FF3B30] font-bold">삭제</span> 를 입력하세요
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="삭제"
                        autoFocus
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[15px] outline-none placeholder:text-[#C7C7CC]"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setDeleteStep(1)}
                        className="flex-1 py-3 rounded-xl bg-[#F2F2F7] text-[#8E8E93] text-[15px] font-medium active:opacity-70"
                      >
                        이전
                      </button>
                      <button
                        disabled={deleteConfirmText !== '삭제' || deleteByProjectMutation.isPending}
                        onClick={() => deleteByProjectMutation.mutate(deleteProjectId)}
                        className="flex-1 py-3 rounded-xl bg-[#FF3B30] text-white text-[15px] font-bold active:opacity-70 disabled:opacity-40"
                      >
                        {deleteByProjectMutation.isPending ? '삭제 중…' : '전체 삭제'}
                      </button>
                    </div>
                  </>
                )
              })()}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   스케줄 등록 Sheet
══════════════════════════════════════════════ */
function AddScheduleSheet({ open, onClose, cellInfo, projects, vendors, isSaving, onSave, allProcessNames, onProcessAdded }: {
  open: boolean; onClose: () => void
  cellInfo: {projectId:string; rowIndex:number; date:string}|null
  projects: any[]; vendors: any[]; isSaving: boolean
  onSave: (form: any) => void
  allProcessNames: string[]
  onProcessAdded: (name: string) => void
}) {
  const supabase = createClient()
  const fromCell = !!cellInfo
  const [form, setForm] = useState({
    project_id: '', start_date: '', end_date: '',
    process: '', worker_name: '', memo: '',
    color: '#007AFF', row_index: 0, row_type: 'process',
  })
  // 담당업체 선택 모드: 'select' | 'direct'
  const [workerMode, setWorkerMode] = useState<'select'|'direct'>('select')
  // 공정 직접 추가
  const [showAddProcess, setShowAddProcess] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')
  const [addingProcess, setAddingProcess] = useState(false)

  const handleAddProcess = async () => {
    const name = newProcessName.trim()
    if (!name) return
    if (allProcessNames.includes(name)) {
      setForm(f => ({ ...f, process: name, color: PROCESS_COLORS[name] ?? '#8E8E93' }))
      setNewProcessName('')
      setShowAddProcess(false)
      return
    }
    setAddingProcess(true)
    try {
      const { data: profile } = await supabase.from('user_profiles').select('company_id').eq('id', (await supabase.auth.getUser()).data.user!.id).single()
      await supabase.from('company_processes').upsert({ company_id: profile!.company_id, name }, { onConflict: 'company_id,name' })
      onProcessAdded(name)
      setForm(f => ({ ...f, process: name, color: '#8E8E93' }))
      setNewProcessName('')
      setShowAddProcess(false)
      toast.success(`'${name}' 공정이 추가됐습니다`)
    } catch { toast.error('공정 추가에 실패했습니다') }
    finally { setAddingProcess(false) }
  }

  useEffect(() => {
    if (open) {
      const rowIdx = cellInfo?.rowIndex ?? 0
      const dt = cellInfo?.date ?? toYMD(new Date())
      setForm({
        project_id: cellInfo?.projectId ?? (projects[0]?.id ?? ''),
        start_date: dt, end_date: dt,
        process: '', worker_name: '', memo: '',
        color: '#007AFF',
        row_index: rowIdx,
        row_type: rowIdx >= 5 ? 'task' : 'process',
      })
      setWorkerMode('select')
    }
  }, [open, cellInfo])

  const handleProcessSelect = (p: string) => {
    setForm(f => ({ ...f, process: p, color: PROCESS_COLORS[p] ?? '#007AFF' }))
  }

  const handleSave = () => {
    if (!form.project_id) { toast.error('현장을 선택하세요'); return }
    if (form.row_type !== 'task' && !form.process) { toast.error('공정을 선택하세요'); return }
    if (!form.start_date) { toast.error('시작 날짜를 선택하세요'); return }
    onSave(form)
  }

  // 공유 텍스트 생성 (요일 + 비밀번호 포함)
  const buildAddShareText = () => {
    const proj = projects.find((p:any) => p.id === form.project_id)
    const sd = form.start_date ?? ''
    const ed = form.end_date ?? ''
    const dateStr = !sd ? '' : (sd === ed || !ed)
      ? formatDateWithDay(sd)
      : `${formatDateWithDay(sd)} ~ ${formatDateWithDay(ed)}`
    return [
      `📋 ${proj?.name ?? '현장'}`,
      form.process ? `공정: ${form.process}` : '',
      dateStr ? `기간: ${dateStr}` : '',
      form.worker_name ? `담당: ${form.worker_name}` : '',
      form.memo ? `메모: ${form.memo}` : '',
      proj?.access_code ? `🔑 공동현관: ${proj.access_code}` : '',
      proj?.unit_password ? `🏠 세대현관: ${proj.unit_password}` : '',
      '📞 일정 조정 필요시 연락 부탁드립니다',
    ].filter(Boolean).join('\n')
  }

  // 공유 (등록 전 미리보기 공유)
  const handleShare = () => {
    const text = buildAddShareText()
    if (!text.trim()) { toast.error('내용을 먼저 입력하세요'); return }
    if (navigator.share) navigator.share({ text })
    else { navigator.clipboard.writeText(text); toast.success('클립보드에 복사됐습니다') }
  }

  const isTask = form.row_index >= 5

  // 선택된 공정에 맞는 거래처 필터
  const filteredVendors = form.process
    ? vendors.filter((v:any) => !v.process || v.process === form.process || v.process === '' )
    : vendors

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="bottom"
        className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight:'min(94dvh,94vh)', height:'min(94dvh,94vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#FF3B30] text-[16px] min-w-[44px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">스케줄 추가</SheetTitle>
            <button onClick={handleSave} disabled={isSaving}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40 min-w-[44px] text-right">
              {isSaving ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{WebkitOverflowScrolling:'touch'}}>
          <div className="px-5 py-4 space-y-4">

            {/* 현장 선택 */}
            <div>
              <label className={labelCls}>현장 *</label>
              {fromCell ? (
                <div className="px-3 py-2.5 rounded-xl bg-[#F2F2F7] border border-black/10 text-[15px] text-black">
                  {projects.find((p:any) => p.id === form.project_id)?.name ?? '현장'}
                </div>
              ) : (
                <select value={form.project_id} onChange={e => setForm(f=>({...f, project_id:e.target.value}))} className={inputCls}>
                  <option value="">현장을 선택하세요</option>
                  {projects.map((p:any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* 행 선택 (+ 버튼으로 열었을 때) */}
            {!fromCell && (
              <div>
                <label className={labelCls}>행 선택 *</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {ROW_OPTIONS.map(opt => {
                    const sel = form.row_index === opt.value
                    const isTaskRow = opt.type === 'task'
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setForm(f => ({ ...f, row_index: opt.value, row_type: opt.type }))}
                        className={cn(
                          'py-2 rounded-xl text-[11px] font-semibold border transition-all',
                          sel
                            ? isTaskRow ? 'bg-[#FF9500] text-white border-transparent' : 'bg-[#007AFF] text-white border-transparent'
                            : 'bg-[#F2F2F7] text-[#8E8E93] border-black/8'
                        )}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 행 타입 배지 */}
            <div className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold',
              isTask ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#007AFF]/10 text-[#007AFF]'
            )}>
              {isTask ? '📋 챕터 할일' : '🔨 공정 스케줄'}
              <span className="opacity-70">· {isTask ? `할일 ${form.row_index-4}행` : `공정 ${form.row_index+1}행`}</span>
            </div>

            {/* 날짜 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>시작 날짜 *</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f=>({...f, start_date:e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date}))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>종료 날짜 *</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={e => setForm(f=>({...f, end_date:e.target.value}))}
                  className={inputCls} />
              </div>
            </div>

            {/* 공정 + 챕터할일 선택 */}
            <div>
              <label className={labelCls}>{isTask ? '할일 내용' : '공정 *'}</label>

              {isTask ? (
                /* ── 챕터 할일 행: 직접 입력 우선 + 뱃지 빠른 선택 */
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={form.process ?? ''}
                    onChange={e => setForm(f => ({ ...f, process: e.target.value }))}
                    placeholder="할일 내용 직접 입력"
                    className={inputCls}
                  />
                  <p className="text-[10px] text-[#8E8E93] font-medium flex items-center gap-1.5">
                    <span className="flex-1 h-px bg-black/8" />빠른 선택<span className="flex-1 h-px bg-black/8" />
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_BADGES.map(tb => {
                      const sel = form.process === tb.label
                      return (
                        <button key={tb.label} type="button"
                          onClick={() => setForm(f => ({ ...f, process: sel ? '' : tb.label, color: sel ? '#007AFF' : tb.color }))}
                          className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                          style={sel ? { backgroundColor: tb.color, color: '#fff' } : { backgroundColor: `${tb.color}18`, color: tb.color }}>
                          {tb.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── 공정 행: 기존 뱃지 선택 */
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    {allProcessNames.map(p => {
                      const color = PROCESS_COLORS[p] ?? '#8E8E93'
                      const sel = form.process === p
                      return (
                        <button key={p} type="button" onClick={() => handleProcessSelect(p)}
                          className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                          style={sel ? {backgroundColor:color, color:'#fff'} : {backgroundColor:`${color}18`, color}}>
                          {p}
                        </button>
                      )
                    })}
                    {/* + 공정 추가 버튼 */}
                    {!showAddProcess ? (
                      <button type="button" onClick={() => setShowAddProcess(true)}
                        className="px-2.5 py-1 rounded-full text-[12px] font-medium border border-dashed border-[#8E8E93]/50 text-[#8E8E93] hover:border-[#007AFF] hover:text-[#007AFF] transition-all">
                        + 공정 추가
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full mt-1">
                        <input
                          autoFocus
                          type="text"
                          value={newProcessName}
                          onChange={e => setNewProcessName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddProcess(); if (e.key === 'Escape') { setShowAddProcess(false); setNewProcessName('') } }}
                          placeholder="공정명 입력 후 Enter"
                          className="flex-1 px-3 py-1.5 rounded-xl border border-[#007AFF]/40 text-[13px] outline-none focus:border-[#007AFF] bg-[#007AFF]/5"
                        />
                        <button type="button" onClick={handleAddProcess} disabled={addingProcess || !newProcessName.trim()}
                          className="px-3 py-1.5 rounded-xl bg-[#007AFF] text-white text-[12px] font-semibold disabled:opacity-40">
                          추가
                        </button>
                        <button type="button" onClick={() => { setShowAddProcess(false); setNewProcessName('') }}
                          className="px-2 py-1.5 rounded-xl bg-black/5 text-[#8E8E93] text-[12px]">
                          취소
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 챕터 할일 구분선 + 뱃지 */}
                  <div className="mt-3 pt-3 border-t border-black/10">
                    <p className="text-[10px] text-[#8E8E93] font-bold tracking-wide mb-2 flex items-center gap-1.5">
                      <span className="flex-1 h-px bg-black/8" />
                      📋 챕터 할일
                      <span className="flex-1 h-px bg-black/8" />
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TASK_BADGES.map(tb => {
                        const sel = form.process === tb.label
                        return (
                          <button key={tb.label} type="button"
                            onClick={() => setForm(f => ({ ...f, process: tb.label, color: tb.color }))}
                            className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                            style={sel
                              ? { backgroundColor: tb.color, color: '#fff' }
                              : { backgroundColor: `${tb.color}18`, color: tb.color }
                            }>
                            {tb.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 담당 업체/작업자 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={cn(labelCls, 'mb-0')}>담당 업체/작업자</label>
                <div className="flex gap-1">
                  <button type="button"
                    onClick={() => { setWorkerMode('select'); setForm(f=>({...f, worker_name:''})) }}
                    className={cn('text-[11px] px-2 py-0.5 rounded-full border transition-all',
                      workerMode === 'select' ? 'bg-[#007AFF] text-white border-transparent' : 'text-[#8E8E93] border-black/10'
                    )}>거래처 선택</button>
                  <button type="button"
                    onClick={() => { setWorkerMode('direct'); setForm(f=>({...f, worker_name:''})) }}
                    className={cn('text-[11px] px-2 py-0.5 rounded-full border transition-all',
                      workerMode === 'direct' ? 'bg-[#007AFF] text-white border-transparent' : 'text-[#8E8E93] border-black/10'
                    )}>직접 입력</button>
                </div>
              </div>

              {workerMode === 'select' ? (
                <VendorDropdown
                  vendors={vendors}
                  selected={form.worker_name}
                  onSelect={(name) => setForm(f=>({...f, worker_name: name}))}
                />
              ) : (
                <input value={form.worker_name} onChange={e => setForm(f=>({...f, worker_name:e.target.value}))}
                  placeholder="업체명 또는 작업자" className={inputCls} />
              )}
            </div>

            {/* 메모 */}
            <div>
              <label className={labelCls}>메모</label>
              <textarea value={form.memo} onChange={e => setForm(f=>({...f, memo:e.target.value}))}
                placeholder="내용 메모" rows={3}
                className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7] resize-none" />
            </div>

            {/* 공유 액션 버튼 */}
            <div>
              <label className={labelCls}>공유하기</label>
              <ShareActions workerName={form.worker_name} vendors={vendors} onShareText={handleShare} getShareText={buildAddShareText} />
            </div>

            <div className="h-4" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   거래처 드롭다운 (선택 후 닫힘)
══════════════════════════════════════════════ */
function VendorDropdown({ vendors, selected, onSelect }: {
  vendors: any[]; selected: string; onSelect: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedVendor = vendors.find((v:any) => v.name === selected)

  return (
    <div className="relative">
      {/* 선택된 값 표시 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#F2F2F7] border border-black/10 text-[15px] active:opacity-70"
      >
        <span className={selected ? 'text-black font-medium' : 'text-[#8E8E93]'}>
          {selected || '거래처를 선택하세요'}
        </span>
        <div className="flex items-center gap-2">
          {selectedVendor?.phone && (
            <span className="text-[11px] text-[#8E8E93]">{selectedVendor.phone}</span>
          )}
          {selected && (
            <button type="button"
              onClick={e => { e.stopPropagation(); onSelect('') }}
              className="text-[#FF3B30] text-[11px] px-1.5 py-0.5 rounded-full bg-[#FF3B30]/8">
              ×
            </button>
          )}
          <ChevronRight className={cn('w-4 h-4 text-[#8E8E93] transition-transform', open ? 'rotate-90' : '')} />
        </div>
      </button>

      {/* 드롭다운 목록 */}
      {open && (
        <div className="mt-1 rounded-xl border border-black/10 bg-white shadow-lg overflow-hidden z-50">
          {vendors.length === 0 ? (
            <p className="text-[13px] text-[#8E8E93] text-center py-4">등록된 거래처가 없습니다</p>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-black/5">
              {vendors.map((v:any) => (
                <button key={v.id} type="button"
                  onClick={() => { onSelect(v.name); setOpen(false) }}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-center justify-between transition-colors active:bg-[#007AFF]/5',
                    selected === v.name ? 'bg-[#007AFF]/8' : ''
                  )}>
                  <span className={cn('text-[14px] font-medium', selected === v.name ? 'text-[#007AFF]' : 'text-black')}>
                    {v.name}
                  </span>
                  {v.phone && <span className="text-[12px] text-[#8E8E93]">{v.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   공유 액션 버튼 (전화 / 문자 / 카카오)
══════════════════════════════════════════════ */
function ShareActions({ workerName, vendors, onShareText, getShareText }: {
  workerName: string; vendors: any[]
  onShareText: () => void
  getShareText: () => string
}) {
  const vendor = vendors.find((v:any) => v.name === workerName)
  const rawPhone = vendor?.phone?.replace(/[^0-9]/g, '') ?? ''
  const hasPhone = !!rawPhone

  // 문자: 항상 활성 — body에 공유 메시지 포함
  const handleSms = () => {
    const text = getShareText()
    const encoded = encodeURIComponent(text)
    if (hasPhone) {
      window.location.href = `sms:${rawPhone}?body=${encoded}`
    } else {
      navigator.clipboard.writeText(text).catch(() => {})
      window.location.href = `sms:?body=${encoded}`
    }
  }

  // 카톡: 항상 활성 — 클립보드 복사 후 앱 열기
  const handleKakao = () => {
    const text = getShareText()
    navigator.clipboard.writeText(text).then(() => {
      toast.success('메시지가 복사됐습니다. 카카오톡에 붙여넣기 하세요')
    }).catch(() => {
      toast.error('복사 실패. 직접 내용을 복사해 주세요')
    })
    setTimeout(() => { window.location.href = 'kakaotalk://launch' }, 600)
  }

  return (
    <div className="flex gap-2">
      {/* 전화 — 번호 있을 때만 활성 */}
      <button type="button"
        disabled={!hasPhone}
        onClick={() => { if (hasPhone) window.location.href = `tel:${rawPhone}` }}
        className={cn(
          'flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border transition-all',
          hasPhone ? 'text-[#34C759] border-[#34C759]/20 bg-[#34C759]/8 active:opacity-70' : 'text-[#C7C7CC] border-black/5 bg-[#F2F2F7]'
        )}>
        <Phone className="w-3.5 h-3.5" />전화
      </button>
      {/* 문자 — 항상 활성 */}
      <button type="button"
        onClick={handleSms}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#007AFF] border-[#007AFF]/20 bg-[#007AFF]/8 active:opacity-70">
        <MessageSquare className="w-3.5 h-3.5" />문자
      </button>
      {/* 카톡 — 항상 활성 */}
      <button type="button"
        onClick={handleKakao}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#3A1D1D] border-[#FAE100]/40 bg-[#FAE100]/15 active:opacity-70">
        <span className="text-base leading-none">💬</span>카톡
      </button>
      {/* 공유 */}
      <button type="button"
        onClick={onShareText}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#8E8E93] border-black/10 bg-[#F2F2F7] active:opacity-70">
        <Share2 className="w-3.5 h-3.5" />공유
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════
   스케줄 상세 Sheet
══════════════════════════════════════════════ */
function DetailSheet({ open, onClose, schedule, projects, canManage, isDeleting, isMoving, onEdit, onDelete, onShare, buildShareText, onMoveDate }: {
  open:boolean; onClose:()=>void; schedule:any|null; projects:any[]
  canManage:boolean; isDeleting:boolean; isMoving:boolean
  onEdit:()=>void; onDelete:(id:string)=>void; onShare:(s:any)=>void
  buildShareText:(s:any)=>string
  onMoveDate:(id:string, days:number)=>void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { if (open) setConfirmDelete(false) }, [open])

  if (!schedule) return null
  const proj = projects.find((p:any) => p.id === schedule.project_id)
  const color = schedule.color ?? '#007AFF'
  const sd = schedule.start_date ?? schedule.date
  const ed = schedule.end_date ?? schedule.date
  const dateLabel = sd === ed
    ? formatDateWithDay(sd)
    : `${formatDateWithDay(sd)} ~ ${formatDateWithDay(ed)}`

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="bottom"
        className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight:'min(88dvh,88vh)', height:'min(88dvh,88vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* 헤더 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0 rounded-t-2xl"
          style={{ backgroundColor: `${color}15` }}>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-[17px] font-semibold">스케줄 상세</SheetTitle>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center active:opacity-60">
              <X className="w-4 h-4 text-[#3C3C43]" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

          {/* 공정 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-full text-[14px] font-bold text-white"
              style={{ backgroundColor: color }}>
              {schedule.process}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#8E8E93]/15 text-[#3C3C43]">
              {schedule.row_type === 'task' ? '📋 챕터 할일' : '🔨 공정'} · {schedule.row_index >= 5 ? `할일 ${schedule.row_index-4}행` : `공정 ${(schedule.row_index??0)+1}행`}
            </span>
          </div>

          {/* 정보 카드 */}
          <div className="rounded-2xl bg-white border border-black/5 divide-y divide-black/5">
            <InfoRow label="현장" value={proj?.name ?? '-'} />
            <InfoRow label="날짜" value={dateLabel} />
            {schedule.worker_name && <InfoRow label="담당자" value={schedule.worker_name} />}
            {schedule.memo && <InfoRow label="메모" value={schedule.memo} />}
          </div>

          {/* ── 날짜 이동 ── */}
          <div>
            <p className={cn(labelCls, 'mb-2')}>날짜 이동</p>
            <div className="flex gap-1.5">
              {[
                { label: '«7일', days: -7 },
                { label: '‹1일', days: -1 },
                { label: '1일›', days:  1 },
                { label: '7일»', days:  7 },
              ].map(btn => (
                <button key={btn.days} type="button"
                  disabled={isMoving}
                  onClick={() => onMoveDate(schedule.id, btn.days)}
                  className="flex-1 py-2.5 rounded-xl bg-[#F2F2F7] text-[13px] font-semibold text-[#3C3C43] border border-black/8 active:bg-black/10 disabled:opacity-40">
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 공유 액션 ── */}
          <div>
            <p className={cn(labelCls, 'mb-2')}>공유하기</p>
            <DetailShareActions schedule={schedule} onShare={onShare} buildShareText={buildShareText} />
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex-shrink-0 px-5 pb-safe pt-3 border-t border-black/5 space-y-2">
          {!confirmDelete ? (
            <div className="flex gap-2">
              {canManage && (
                <button onClick={onEdit}
                  className="flex-1 py-3 rounded-xl bg-[#007AFF] text-white text-[15px] font-semibold flex items-center justify-center gap-2 active:opacity-80">
                  <Edit2 className="w-4 h-4" />수정
                </button>
              )}
              <button onClick={() => onShare(schedule)}
                className="flex-1 py-3 rounded-xl bg-[#34C759]/10 text-[#34C759] text-[15px] font-semibold flex items-center justify-center gap-2 active:opacity-80">
                <Share2 className="w-4 h-4" />공유
              </button>
              {canManage && (
                <button onClick={() => setConfirmDelete(true)}
                  className="py-3 px-4 rounded-xl bg-[#FF3B30]/8 text-[#FF3B30] text-[15px] flex items-center justify-center active:opacity-80">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-[#FF3B30]/5 border border-[#FF3B30]/20 p-3 space-y-2">
              <p className="text-[13px] text-[#FF3B30] font-medium text-center">정말 삭제하시겠습니까?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 bg-white text-[#8E8E93] text-[14px] rounded-xl border border-black/10">취소</button>
                <button onClick={() => onDelete(schedule.id)} disabled={isDeleting}
                  className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[14px] font-semibold rounded-xl disabled:opacity-40">
                  {isDeleting ? '삭제중...' : '삭제'}
                </button>
              </div>
            </div>
          )}
          <div className="h-1" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   DetailSheet 공유 액션 (전화/문자/카카오/공유)
   - 전화: worker_phone 있으면 활성
   - 문자: 항상 활성 (번호 있으면 자동입력, 없으면 앱만 열기) + 메시지 body 포함
   - 카톡: 항상 활성 — 메시지 클립보드 복사 후 카카오톡 앱 열기
   - 공유: 시스템 공유 시트 / 클립보드 복사
══════════════════════════════════════════════ */
function DetailShareActions({ schedule, onShare, buildShareText }: {
  schedule: any
  onShare: (s:any) => void
  buildShareText: (s:any) => string
}) {
  const rawPhone = schedule.worker_phone?.replace(/[^0-9]/g, '') ?? ''
  const hasPhone = !!rawPhone

  // 문자: 메시지 body 포함
  const handleSms = () => {
    const text = buildShareText(schedule)
    const encoded = encodeURIComponent(text)
    if (hasPhone) {
      window.location.href = `sms:${rawPhone}?body=${encoded}`
    } else {
      // 번호 없으면 메시지만 복사하고 문자 앱 열기
      navigator.clipboard.writeText(text).catch(() => {})
      window.location.href = `sms:?body=${encoded}`
    }
  }

  // 카톡: 메시지 클립보드 복사 → 카카오톡 열기
  const handleKakao = () => {
    const text = buildShareText(schedule)
    navigator.clipboard.writeText(text).then(() => {
      toast.success('메시지가 복사됐습니다. 카카오톡에 붙여넣기 하세요')
    }).catch(() => {
      toast.error('복사 실패. 직접 내용을 복사해 주세요')
    })
    setTimeout(() => {
      window.location.href = 'kakaotalk://launch'
    }, 600)
  }

  return (
    <div className="flex gap-2">
      {/* 전화 — worker_phone 있을 때만 활성 */}
      <button type="button"
        disabled={!hasPhone}
        onClick={() => { if (hasPhone) window.location.href = `tel:${rawPhone}` }}
        className={cn(
          'flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border active:opacity-70',
          hasPhone ? 'text-[#34C759] border-[#34C759]/20 bg-[#34C759]/8' : 'text-[#C7C7CC] border-black/5 bg-[#F2F2F7]'
        )}>
        <Phone className="w-3.5 h-3.5" />전화
      </button>

      {/* 문자 — 항상 활성, 메시지 body 포함 */}
      <button type="button"
        onClick={handleSms}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#007AFF] border-[#007AFF]/20 bg-[#007AFF]/8 active:opacity-70">
        <MessageSquare className="w-3.5 h-3.5" />문자
      </button>

      {/* 카톡 — 항상 활성, 클립보드 복사 후 앱 열기 */}
      <button type="button"
        onClick={handleKakao}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#3A1D1D] border-[#FAE100]/40 bg-[#FAE100]/15 active:opacity-70">
        <span className="text-base leading-none">💬</span>카톡
      </button>

      {/* 공유 — 시스템 공유 or 클립보드 */}
      <button type="button"
        onClick={() => onShare(schedule)}
        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 border text-[#8E8E93] border-black/10 bg-[#F2F2F7] active:opacity-70">
        <Share2 className="w-3.5 h-3.5" />공유
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════
   스케줄 수정 Sheet
══════════════════════════════════════════════ */
function EditScheduleSheet({ open, onClose, schedule, vendors, isSaving, onSave, allProcessNames, onProcessAdded }: {
  open:boolean; onClose:()=>void; schedule:any|null
  vendors:any[]; isSaving:boolean; onSave:(form:any)=>void
  allProcessNames: string[]
  onProcessAdded: (name: string) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState<any>({})
  const [workerMode, setWorkerMode] = useState<'select'|'direct'>('select')
  const [showAddProcess, setShowAddProcess] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')
  const [addingProcess, setAddingProcess] = useState(false)

  const handleAddProcess = async () => {
    const name = newProcessName.trim()
    if (!name) return
    if (allProcessNames.includes(name)) {
      setForm((f: any) => ({ ...f, process: name, color: PROCESS_COLORS[name] ?? '#8E8E93' }))
      setNewProcessName(''); setShowAddProcess(false); return
    }
    setAddingProcess(true)
    try {
      const { data: profile } = await supabase.from('user_profiles').select('company_id').eq('id', (await supabase.auth.getUser()).data.user!.id).single()
      await supabase.from('company_processes').upsert({ company_id: profile!.company_id, name }, { onConflict: 'company_id,name' })
      onProcessAdded(name)
      setForm((f: any) => ({ ...f, process: name, color: '#8E8E93' }))
      setNewProcessName(''); setShowAddProcess(false)
      toast.success(`'${name}' 공정이 추가됐습니다`)
    } catch { toast.error('공정 추가에 실패했습니다') }
    finally { setAddingProcess(false) }
  }

  useEffect(() => {
    if (open && schedule) {
      setForm({
        id: schedule.id,
        project_id: schedule.project_id,
        start_date: schedule.start_date ?? schedule.date,
        end_date: schedule.end_date ?? schedule.date,
        process: schedule.process ?? '',
        worker_name: schedule.worker_name ?? '',
        memo: schedule.memo ?? '',
        color: schedule.color ?? '#007AFF',
        row_index: schedule.row_index ?? 0,
        row_type: schedule.row_type ?? 'process',
      })
      setWorkerMode(schedule.worker_name ? 'select' : 'select')
    }
  }, [open, schedule])

  const handleSave = () => {
    if (form.row_type !== 'task' && !form.process) { toast.error('공정을 선택하세요'); return }
    onSave(form)
  }

  if (!schedule) return null

  const isTask = (form.row_type ?? 'process') === 'task'

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="bottom"
        className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight:'min(92dvh,92vh)', height:'min(92dvh,92vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#FF3B30] text-[16px] min-w-[44px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">스케줄 수정</SheetTitle>
            <button onClick={handleSave} disabled={isSaving}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40 min-w-[44px] text-right">
              {isSaving ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{WebkitOverflowScrolling:'touch'}}>
          <div className="px-5 py-4 space-y-4">

            {/* 날짜 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>시작 날짜</label>
                <input type="date" value={form.start_date ?? ''}
                  onChange={e => setForm((f:any) => ({...f, start_date:e.target.value}))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>종료 날짜</label>
                <input type="date" value={form.end_date ?? ''} min={form.start_date}
                  onChange={e => setForm((f:any) => ({...f, end_date:e.target.value}))} className={inputCls} />
              </div>
            </div>

            {/* 공정 / 챕터 할일 */}
            <div>
              <label className={labelCls}>{isTask ? '할일 내용' : '공정 *'}</label>

              {isTask ? (
                /* ── 챕터 할일: 직접 입력 + 뱃지 빠른 선택 */
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={form.process ?? ''}
                    onChange={e => setForm((f:any) => ({ ...f, process: e.target.value }))}
                    placeholder="할일 내용 직접 입력"
                    className={inputCls}
                  />
                  <p className="text-[10px] text-[#8E8E93] font-medium flex items-center gap-1.5">
                    <span className="flex-1 h-px bg-black/8" />빠른 선택<span className="flex-1 h-px bg-black/8" />
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_BADGES.map(tb => {
                      const sel = form.process === tb.label
                      return (
                        <button key={tb.label} type="button"
                          onClick={() => setForm((f:any) => ({ ...f, process: sel ? '' : tb.label, color: sel ? '#007AFF' : tb.color }))}
                          className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                          style={sel ? { backgroundColor: tb.color, color: '#fff' } : { backgroundColor: `${tb.color}18`, color: tb.color }}>
                          {tb.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── 공정 행: 공정 뱃지 + 챕터할일 뱃지 */
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    {allProcessNames.map(p => {
                      const color = PROCESS_COLORS[p] ?? '#8E8E93'
                      const sel = form.process === p
                      return (
                        <button key={p} type="button"
                          onClick={() => setForm((f:any) => ({ ...f, process: p, color: PROCESS_COLORS[p] ?? '#8E8E93' }))}
                          className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                          style={sel ? {backgroundColor:color, color:'#fff'} : {backgroundColor:`${color}18`, color}}>
                          {p}
                        </button>
                      )
                    })}
                    {/* + 공정 추가 버튼 */}
                    {!showAddProcess ? (
                      <button type="button" onClick={() => setShowAddProcess(true)}
                        className="px-2.5 py-1 rounded-full text-[12px] font-medium border border-dashed border-[#8E8E93]/50 text-[#8E8E93] hover:border-[#007AFF] hover:text-[#007AFF] transition-all">
                        + 공정 추가
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full mt-1">
                        <input
                          autoFocus
                          type="text"
                          value={newProcessName}
                          onChange={e => setNewProcessName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddProcess(); if (e.key === 'Escape') { setShowAddProcess(false); setNewProcessName('') } }}
                          placeholder="공정명 입력 후 Enter"
                          className="flex-1 px-3 py-1.5 rounded-xl border border-[#007AFF]/40 text-[13px] outline-none focus:border-[#007AFF] bg-[#007AFF]/5"
                        />
                        <button type="button" onClick={handleAddProcess} disabled={addingProcess || !newProcessName.trim()}
                          className="px-3 py-1.5 rounded-xl bg-[#007AFF] text-white text-[12px] font-semibold disabled:opacity-40">
                          추가
                        </button>
                        <button type="button" onClick={() => { setShowAddProcess(false); setNewProcessName('') }}
                          className="px-2 py-1.5 rounded-xl bg-black/5 text-[#8E8E93] text-[12px]">
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-black/10">
                    <p className="text-[10px] text-[#8E8E93] font-bold tracking-wide mb-2 flex items-center gap-1.5">
                      <span className="flex-1 h-px bg-black/8" />
                      📋 챕터 할일
                      <span className="flex-1 h-px bg-black/8" />
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TASK_BADGES.map(tb => {
                        const sel = form.process === tb.label
                        return (
                          <button key={tb.label} type="button"
                            onClick={() => setForm((f:any) => ({ ...f, process: tb.label, color: tb.color }))}
                            className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                            style={sel ? { backgroundColor: tb.color, color: '#fff' } : { backgroundColor: `${tb.color}18`, color: tb.color }}>
                            {tb.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 담당 업체/작업자 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={cn(labelCls, 'mb-0')}>담당 업체/작업자</label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setWorkerMode('select')}
                    className={cn('text-[11px] px-2 py-0.5 rounded-full border',
                      workerMode === 'select' ? 'bg-[#007AFF] text-white border-transparent' : 'text-[#8E8E93] border-black/10'
                    )}>거래처 선택</button>
                  <button type="button" onClick={() => setWorkerMode('direct')}
                    className={cn('text-[11px] px-2 py-0.5 rounded-full border',
                      workerMode === 'direct' ? 'bg-[#007AFF] text-white border-transparent' : 'text-[#8E8E93] border-black/10'
                    )}>직접 입력</button>
                </div>
              </div>
              {workerMode === 'select' ? (
                <VendorDropdown
                  vendors={vendors}
                  selected={form.worker_name ?? ''}
                  onSelect={(name) => setForm((f:any) => ({...f, worker_name: name}))}
                />
              ) : (
                <input value={form.worker_name ?? ''} onChange={e => setForm((f:any)=>({...f,worker_name:e.target.value}))}
                  placeholder="업체명 또는 작업자" className={inputCls} />
              )}
            </div>

            {/* 메모 */}
            <div>
              <label className={labelCls}>메모</label>
              <textarea value={form.memo ?? ''} onChange={e => setForm((f:any)=>({...f,memo:e.target.value}))}
                placeholder="내용 메모" rows={3}
                className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7] resize-none" />
            </div>

            <div className="h-4" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   InfoRow
══════════════════════════════════════════════ */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="text-[12px] text-[#8E8E93] font-medium w-14 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[14px] text-black flex-1">{value}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════
   날짜 이동 모드 선택 모달
══════════════════════════════════════════════ */
function MoveModeModal({ days, schedule, isMoving, onMoveOnly, onMoveAll, onClose }: {
  days: number
  schedule: any
  isMoving: boolean
  onMoveOnly: () => void
  onMoveAll: () => void
  onClose: () => void
}) {
  const direction = days > 0 ? `${days}일 뒤로` : `${Math.abs(days)}일 앞으로`
  return (
    <Sheet open={true} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0"
        style={{ maxHeight: 'min(50dvh,50vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="px-5 py-5">
          <p className="text-[17px] font-bold text-[#1C1C1E] mb-1">날짜 이동</p>
          <p className="text-[13px] text-[#8E8E93] mb-5 leading-relaxed">
            <span className="font-semibold text-black">{schedule.process}</span>을(를){' '}
            <span className="font-semibold text-[#007AFF]">{direction}</span> 이동합니다.
            <br />
            어떻게 이동할까요?
          </p>
          <div className="space-y-2.5">
            <button
              onClick={onMoveOnly}
              disabled={isMoving}
              className="w-full py-3.5 rounded-2xl bg-[#007AFF] text-white text-[15px] font-bold active:opacity-80 disabled:opacity-40"
            >
              이 공정만 이동
            </button>
            <button
              onClick={onMoveAll}
              disabled={isMoving}
              className="w-full py-3.5 rounded-2xl bg-[#FF9500] text-white text-[15px] font-bold active:opacity-80 disabled:opacity-40"
            >
              이 공정 포함 이후 공정 모두 이동
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-[#8E8E93] text-[15px]"
            >
              취소
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   저장 후 공유 Sheet
   - 저장 완료 직후 자동으로 열림
   - 이미지처럼 연락처 + 공유 텍스트 자동 생성
══════════════════════════════════════════════ */
function SavedShareSheet({ open, onClose, form, projects, vendors }: {
  open: boolean; onClose: () => void
  form: any; projects: any[]; vendors: any[]
}) {
  if (!form) return null

  const proj = projects.find((p: any) => p.id === form.project_id)
  const vendor = vendors.find((v: any) => v.name === form.worker_name)
  const rawPhone = vendor?.phone?.replace(/[^0-9]/g, '') ?? ''
  const hasPhone = !!rawPhone

  const sd = form.start_date ?? ''
  const ed = form.end_date ?? ''
  const dateStr = sd === ed || !ed
    ? (sd ? formatDateWithDay(sd) : '')
    : `${formatDateWithDay(sd)} ~ ${formatDateWithDay(ed)}`
  const isUpdate = !!form.id
  const color = form.color ?? '#007AFF'

  // 공유 텍스트 (날짜 요일 + 현장 비밀번호 포함)
  const shareText = [
    '[현장 스케줄 공유]',
    `📍 현장: ${proj?.name ?? '-'}`,
    `🔨 작업: ${form.process}`,
    dateStr ? `📅 날짜: ${dateStr}` : '',
    form.worker_name ? `👷 담당: ${form.worker_name}` : '',
    form.memo ? `📝 메모: ${form.memo}` : '',
    proj?.access_code ? `🔑 공동현관: ${proj.access_code}` : '',
    proj?.unit_password ? `🏠 세대현관: ${proj.unit_password}` : '',
    '📞 일정 조정 필요시 연락 부탁드립니다',
  ].filter(Boolean).join('\n')

  const handleSMS = () => {
    const encoded = encodeURIComponent(shareText)
    if (hasPhone) {
      window.location.href = `sms:${rawPhone}?body=${encoded}`
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {})
      window.location.href = `sms:?body=${encoded}`
    }
  }

  const handleKakao = () => {
    navigator.clipboard.writeText(shareText).then(() => {
      toast.success('메시지가 복사됐습니다. 카카오톡에 붙여넣기 하세요')
    }).catch(() => {
      toast.error('복사 실패. 직접 내용을 복사해 주세요')
    })
    setTimeout(() => {
      window.location.href = 'kakaotalk://launch'
    }, 600)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText).then(() => toast.success('클립보드에 복사됐습니다'))
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: proj?.name ?? '현장 스케줄', text: shareText })
    } else {
      handleCopy()
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(80dvh,80vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* 헤더 */}
        <div className="px-5 pt-4 pb-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Share2 className="w-4 h-4 text-[#007AFF]" />
            <span className="text-[17px] font-bold text-black">스케줄 공유</span>
            <span className="ml-auto text-[12px] font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color }}>
              {isUpdate ? '수정됨' : '등록됨'}
            </span>
          </div>
          <p className="text-[12px] text-[#8E8E93]">다음 연락처로 공유합니다</p>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 space-y-3">

            {/* 연락처 정보 */}
            {form.worker_name && (
              <div className="flex items-center justify-between bg-[#F2F2F7] rounded-xl px-4 py-3">
                <div>
                  <p className="text-[15px] font-semibold text-black">{form.worker_name}</p>
                  {vendor?.phone && (
                    <p className="text-[12px] text-[#8E8E93] mt-0.5">
                      {vendor.phone}
                      {form.process && <span className="ml-1 text-[#8E8E93]">· {form.process}</span>}
                    </p>
                  )}
                </div>
                {hasPhone && (
                  <a href={`tel:${rawPhone}`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#34C759] text-white text-[13px] font-semibold active:opacity-70">
                    <Phone className="w-3.5 h-3.5" />전화
                  </a>
                )}
              </div>
            )}
            {!form.worker_name && (
              <div className="bg-[#F2F2F7] rounded-xl px-4 py-3">
                <p className="text-[13px] text-[#8E8E93]">담당 업체가 지정되지 않았습니다</p>
              </div>
            )}

            {/* 공유 텍스트 미리보기 */}
            <div className="bg-[#F8F9FA] rounded-xl border border-black/8 px-4 py-3">
              <pre className="text-[13px] text-black leading-relaxed whitespace-pre-wrap font-sans">
                {shareText}
              </pre>
            </div>

            {/* 액션 버튼 4개 */}
            <div className="grid grid-cols-4 gap-2">
              {/* 문자 — 항상 활성, 메시지 body 포함 */}
              <button
                onClick={handleSMS}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#34C759] transition-all active:opacity-70">
                <MessageSquare className="w-6 h-6 text-white" />
                <span className="text-[12px] font-bold text-white">문자</span>
              </button>

              {/* 카카오톡 — 항상 활성, 메시지 복사 후 앱 열기 */}
              <button
                onClick={handleKakao}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#FAE100] transition-all active:opacity-70">
                <span className="text-2xl leading-none">💬</span>
                <span className="text-[12px] font-bold text-[#3A1D1D]">카카오톡</span>
              </button>

              {/* 복사 */}
              <button
                onClick={handleCopy}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#007AFF] transition-all active:opacity-70">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"/>
                </svg>
                <span className="text-[12px] font-bold text-white">복사</span>
              </button>

              {/* 공유 */}
              <button
                onClick={handleShare}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#FF9500] transition-all active:opacity-70">
                <Share2 className="w-6 h-6 text-white" />
                <span className="text-[12px] font-bold text-white">공유</span>
              </button>
            </div>

          </div>
        </div>

        {/* 닫기 */}
        <div className="px-5 pb-safe pt-2 flex-shrink-0 border-t border-black/5">
          <button
            onClick={onClose}
            className="w-full py-3.5 text-[16px] font-semibold text-[#007AFF] active:opacity-60">
            닫기
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
