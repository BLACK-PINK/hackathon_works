'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, Printer, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, addDays, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 공정 색상 (SchedulerPageClient 와 동일)
const PROCESS_COLORS: Record<string, string> = {
  '보양':'#8E8E93','철거':'#FF3B30','바닥철거':'#FF6B35',
  '경량철골':'#636366','금속·창호':'#FF9500','소방':'#FF3B30',
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

// ── 기본 하단 텍스트
const DEFAULT_OWNER_NOTES =
  '현장여건의 불가피한 사유로 공정별 1-2일 정도의 일정 변동이 있을 수 있습니다.'

const DEFAULT_WORKER_NOTES =
  `문제 발생 시 즉시 공유 및 보고 / 본인 공정 폐기물 정리 필수
안전장비 및 보호구 착용 필수 / 현장 정리 상태 사진 촬영 후 공유
작업시간 엄수 (오전 9시-오후5시, 휴게시간 오전 12시-오후1시)
실내 절대 금연 / 퇴실시 메인 전원 차단 / 창문 닫고 출입문 잠금`

// ── 날짜 헬퍼
const fromYMD = (s: string) => new Date(s + 'T00:00:00')
const toYMD   = (d: Date)   => format(d, 'yyyy-MM-dd')
const DAY_NAMES = ['일','월','화','수','목','금','토']

// ── 한국 법정공휴일 (대체휴일 포함, 2024~2030)
const KR_HOLIDAYS: Record<number, string[]> = {
  2024: ['01-01','02-09','02-10','02-11','02-12','03-01','04-10','05-05','05-06','06-06','08-15','09-16','09-17','09-18','10-03','10-09','12-25'],
  2025: ['01-01','01-27','01-28','01-29','01-30','03-01','03-03','05-05','05-06','06-03','06-06','08-15','10-03','10-05','10-06','10-07','10-08','10-09','12-25'],
  2026: ['01-01','02-16','02-17','02-18','03-01','03-02','05-01','05-05','05-24','05-25','06-03','06-06','08-15','08-17','09-24','09-25','09-26','10-03','10-05','10-09','12-25'],
  2027: ['01-01','02-06','02-07','02-08','02-09','03-01','05-01','05-03','05-05','05-13','06-06','06-07','08-15','08-16','09-14','09-15','09-16','10-03','10-04','10-09','10-11','12-25','12-27'],
  2028: ['01-01','01-26','01-27','03-01','05-01','05-02','05-05','06-06','07-17','08-15','10-02','10-03','10-04','10-09','12-25'],
  2029: ['01-01','02-12','02-13','02-14','03-01','05-01','05-05','05-07','05-20','05-21','06-06','08-15','09-21','09-22','09-23','09-24','10-03','10-09','12-25'],
  2030: ['01-01','02-04','03-01','05-01','05-05','05-07','05-09','06-06','08-15','09-11','09-12','09-13','10-03','10-09','12-25'],
}

function isKrHoliday(ymd: string): boolean {
  const [y, m, d] = ymd.split('-')
  const year = parseInt(y)
  const md = `${m}-${d}`
  return (KR_HOLIDAYS[year] ?? []).includes(md)
}

interface Props { profile: any }

export function SiteScheduleCalendar({ profile }: Props) {
  const supabase      = createClient()
  const queryClient   = useQueryClient()
  const printRef      = useRef<HTMLDivElement>(null)
  const [projectId, setProjectId] = useState<string>('')

  // 하단 메모 편집 상태
  const [editingOwner,  setEditingOwner]  = useState(false)
  const [editingWorker, setEditingWorker] = useState(false)
  const [ownerDraft,  setOwnerDraft]  = useState('')
  const [workerDraft, setWorkerDraft] = useState('')

  // ── 현장 목록
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

  // ── 하단 텍스트 (company 단위로 저장)
  const { data: noteData, refetch: refetchNote } = useQuery({
    queryKey: ['schedule-notes', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedule_notes')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle()    // 없어도 null 반환 (에러 아님)
      return data
    },
  })

  const ownerNotes  = noteData?.owner_notes  ?? DEFAULT_OWNER_NOTES
  const workerNotes = noteData?.worker_notes ?? DEFAULT_WORKER_NOTES

  const saveNotesMutation = useMutation({
    mutationFn: async ({ owner_notes, worker_notes }: { owner_notes: string; worker_notes: string }) => {
      if (noteData?.id) {
        const { error } = await supabase
          .from('schedule_notes')
          .update({ owner_notes, worker_notes })
          .eq('id', noteData.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('schedule_notes')
          .insert({ company_id: profile.company_id, owner_notes, worker_notes })
        if (error) throw error
      }
    },
    onSuccess: () => { refetchNote(); toast.success('저장되었습니다') },
    onError:   () => toast.error('저장 실패'),
  })

  // ── 선택 현장의 스케줄
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['site-calendar-schedules', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const { data } = await supabase
        .from('schedules')
        .select('id, process, color, start_date, end_date, date, row_type, worker_name')
        .eq('project_id', projectId)
        .order('start_date', { ascending: true })
      return data || []
    },
    enabled: !!projectId,
  })

  // ── 날짜 범위: 첫 공정 시작일이 포함된 주(일) ~ 마지막 공정 종료일이 포함된 주(토)
  const { weekStarts, allDates } = (() => {
    if (schedules.length === 0) return { weekStarts: [], allDates: [] }
    const allStart = schedules.map(s => s.start_date || s.date).filter(Boolean).sort()[0]
    const allEnd   = schedules.map(s => s.end_date   || s.date).filter(Boolean).sort().reverse()[0]
    if (!allStart || !allEnd) return { weekStarts: [], allDates: [] }

    const rangeStart = startOfWeek(fromYMD(allStart), { weekStartsOn: 0 })
    const rangeEnd   = endOfWeek(  fromYMD(allEnd),   { weekStartsOn: 0 })

    const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 0 })
    const dates: string[] = []
    let cur = new Date(rangeStart)
    while (cur <= rangeEnd) { dates.push(toYMD(cur)); cur = addDays(cur, 1) }
    return { weekStarts: weeks, allDates: dates }
  })()

  // ── 날짜별 공정 맵 (최대 4개)
  const dayMap: Record<string, { process: string; color: string }[]> = {}
  schedules.forEach(s => {
    const sd = s.start_date || s.date
    const ed = s.end_date   || s.date
    if (!sd || !ed) return
    const color = s.color || PROCESS_COLORS[s.process] || '#8E8E93'
    let cur = fromYMD(sd)
    const end = fromYMD(ed)
    while (cur <= end) {
      const ymd = toYMD(cur)
      if (!dayMap[ymd]) dayMap[ymd] = []
      dayMap[ymd].push({ process: s.process, color })
      cur = addDays(cur, 1)
    }
  })

  // ── 인쇄: CSS @media print 방식으로 A4 한 장 출력
  //   JS 스케일은 완전히 제거 — CSS 만으로 처리
  const handlePrint = () => {
    window.print()
  }

  // ── 선택 현장명
  const projectName = projects.find((p: any) => p.id === projectId)?.name ?? ''

  return (
    <div className="flex flex-col bg-[#F2F2F7]">

      {/* ── 컨트롤 바 (탭바 아래 고정) */}
      <div className="bg-white border-b border-black/5 px-3 py-2 flex items-center gap-2 sticky top-[44px] z-10 no-print">
        {/* 현장 선택 */}
        <div className="relative flex-1">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full appearance-none bg-[#F2F2F7] text-[14px] font-medium text-black rounded-xl px-3 py-2 pr-8 outline-none"
          >
            <option value="">현장 선택</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
        </div>

        {/* 인쇄 */}
        <button
          onClick={handlePrint}
          disabled={!projectId}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#007AFF] text-white text-[13px] font-semibold disabled:opacity-30 active:opacity-70 flex-shrink-0"
        >
          <Printer className="w-4 h-4" />
          인쇄
        </button>
      </div>

      {/* ── 본문 영역 */}
      <div className="flex-1" id="print-area" ref={printRef}>

        {!projectId ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-8">
            <span className="text-4xl">🏗️</span>
            <p className="text-[15px] font-semibold text-[#1C1C1E]">현장을 선택하세요</p>
            <p className="text-[13px] text-[#8E8E93]">상단에서 현장을 선택하면<br/>공정 달력이 표시됩니다</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span className="text-4xl">📭</span>
            <p className="text-[15px] font-semibold text-[#1C1C1E]">등록된 공정이 없습니다</p>
          </div>
        ) : (
          <div className="px-2 py-3 space-y-0 print-calendar-wrap">

            {/* ── 타이틀 */}
            <div className="text-center py-3 print-title">
              <p className="text-[11px] text-[#8E8E93] mb-0.5">챕터 현장 시공 공정표</p>
              <p className="text-[15px] font-bold text-[#1C1C1E]">project_ {projectName}</p>
            </div>

            {/* ── 달력 테이블 */}
            <div className="overflow-x-auto print-table-wrap">
              <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                {/* 요일 헤더 */}
                <thead>
                  <tr>
                    {DAY_NAMES.map((d, i) => (
                      <th key={d} className={cn(
                        'text-[12px] font-bold py-2 text-center border border-black/15',
                        i === 0 ? 'text-[#FF3B30] bg-[#FFF5F5]' :
                        i === 6 ? 'text-[#007AFF] bg-[#F0F7FF]' :
                        'text-[#3C3C43] bg-[#F9F9F9]'
                      )}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {weekStarts.map((weekStart, wIdx) => {
                    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
                    const ymds = days.map(d => toYMD(d))

                    // 행 수 고정 4행
                    const rows = 4

                    // 월 경계: 이 주의 첫 날이 새 월의 시작 주인지
                    const isNewMonth = wIdx > 0 &&
                      format(weekStart, 'yyyy-MM') !== format(addDays(weekStart, -7), 'yyyy-MM')

                    return (
                      <tr key={wIdx} className={cn(isNewMonth && 'border-t-2 border-[#CBD5E0]')}>
                        {days.map((day, dIdx) => {
                          const ymd = toYMD(day)
                          const items = dayMap[ymd] ?? []
                          const isSun = dIdx === 0
                          const isSat = dIdx === 6
                          const isWeekend = isSun || isSat
                          const isHoliday = !isWeekend && isKrHoliday(ymd)
                          // 토/일 및 공휴일은 공정 뱃지 숨김 (휴무일)
                          const showItems = (isWeekend || isHoliday) ? [] : items

                          return (
                            <td key={ymd} className={cn(
                              'border border-black/10 align-top',
                              isSun ? 'bg-[#FFF5F5]' :
                              isSat ? 'bg-[#F0F7FF]' :
                              isHoliday ? 'bg-[#FFF5F5]' : 'bg-white'
                            )}
                              style={{ minWidth: 70, width: '14.28%', verticalAlign: 'top' }}
                            >
                              {/* 날짜 */}
                              <div className={cn(
                                'text-[10px] font-medium px-1.5 pt-1.5 pb-0.5',
                                isSun ? 'text-[#FF3B30]' :
                                isSat ? 'text-[#007AFF]' :
                                isHoliday ? 'text-[#FF3B30]' : 'text-[#8E8E93]'
                              )}>
                                {format(day, 'MM월 dd일')}
                              </div>

                              {/* 공정 뱃지 — 개수 제한 없이 전체 표시 */}
                              <div className="px-1 pb-1.5 space-y-0.5" style={{ minHeight: `${rows * 22 + 8}px` }}>
                                {showItems.map((item, idx) => (
                                  <div key={idx}
                                    className="process-badge w-full rounded-sm text-[10px] font-semibold px-1 py-0.5 truncate leading-tight"
                                    style={{ backgroundColor: item.color + 'CC', color: '#fff' }}
                                  >
                                    {item.process}
                                  </div>
                                ))}
                                {/* 빈 행 패딩 — 최소 4행 높이 유지 */}
                                {Array.from({ length: Math.max(0, rows - showItems.length) }).map((_, i) => (
                                  <div key={`empty-${i}`} className="w-full" style={{ height: 22 }} />
                                ))}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 하단 섹션 */}
            <div className="mt-4 space-y-0 border border-black/15 rounded-xl overflow-hidden print-notes-wrap">

              {/* 발주자 체크 사항 */}
              <NoteSection
                title="발주자 체크 사항"
                value={ownerNotes}
                editing={editingOwner}
                draft={ownerDraft}
                onEdit={() => { setOwnerDraft(ownerNotes); setEditingOwner(true) }}
                onDraftChange={setOwnerDraft}
                onSave={() => {
                  saveNotesMutation.mutate({ owner_notes: ownerDraft, worker_notes: workerNotes })
                  setEditingOwner(false)
                }}
                onCancel={() => setEditingOwner(false)}
                multiline={false}
              />

              {/* 작업자 준수 사항 */}
              <NoteSection
                title="작업자 준수 사항"
                value={workerNotes}
                editing={editingWorker}
                draft={workerDraft}
                onEdit={() => { setWorkerDraft(workerNotes); setEditingWorker(true) }}
                onDraftChange={setWorkerDraft}
                onSave={() => {
                  saveNotesMutation.mutate({ owner_notes: ownerNotes, worker_notes: workerDraft })
                  setEditingWorker(false)
                }}
                onCancel={() => setEditingWorker(false)}
                multiline={true}
                borderTop
              />
            </div>

            <div className="h-8 no-print" />
          </div>
        )}
      </div>

      {/* ── 인쇄용 CSS */}
      <style>{`
        @media print {

          /* ━━━ 기본 리셋 ━━━ */
          .no-print { display: none !important; }

          @page {
            size: A4 portrait;
            margin: 6mm 6mm 6mm 6mm;
          }

          html, body {
            width: 210mm !important;
            height: 297mm !important;
            overflow: hidden !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* ━━━ 앱 껍데기 숨김, print-area 만 표시 ━━━ */
          body > * { visibility: hidden !important; }
          #print-area,
          #print-area * { visibility: visible !important; }

          /* ━━━ print-area = A4 용지 전체 꽉 채우기 ━━━
               position:absolute + top/left:0 으로 뷰포트 좌상단에 배치
               width/height 를 정확히 A4 인쇄 영역(margin 제외)으로 고정
               내부 레이아웃이 flex-col 이므로 자동으로 위아래 채움 */
          #print-area {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 198mm !important;   /* 210mm - 좌6mm - 우6mm */
            height: 285mm !important;  /* 297mm - 상6mm - 하6mm */
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            box-sizing: border-box !important;
          }

          /* 컬러 강제 */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ━━━ 내부 px/py 패딩·여백 제거 ━━━ */
          #print-area > div {
            padding: 0 !important;
          }

          /* ━━━ 달력 래퍼: 남은 공간 flex-1 로 꽉 채우기 ━━━ */
          .print-calendar-wrap {
            flex: 1 1 0% !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            padding: 0 2mm !important;
          }

          /* ━━━ 타이틀 ━━━ */
          .print-title {
            flex-shrink: 0 !important;
            padding: 1mm 0 !important;
          }
          .print-title p {
            font-size: 9pt !important;
            margin: 0 !important;
          }

          /* ━━━ 테이블 컨테이너: 나머지 공간 채우기 ━━━ */
          .print-table-wrap {
            flex: 1 1 0% !important;
            overflow: visible !important;
          }

          /* ━━━ 테이블 ━━━ */
          table {
            width: 100% !important;
            height: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: 8pt !important;
          }
          thead { flex-shrink: 0 !important; }
          th {
            font-size: 8pt !important;
            padding: 1mm !important;
          }
          /* tbody 가 남은 높이를 채우도록 */
          tbody {
            height: 100% !important;
          }
          td {
            padding: 0.5mm !important;
            vertical-align: top !important;
          }
          tr { page-break-inside: avoid !important; break-inside: avoid !important; }

          /* 날짜 숫자 */
          td > div:first-child {
            font-size: 7pt !important;
            padding: 0.5mm 1mm !important;
            line-height: 1.2 !important;
          }

          /* 공정 뱃지 */
          .process-badge {
            font-size: 7pt !important;
            padding: 0.5mm 1mm !important;
            line-height: 1.3 !important;
            margin-bottom: 0.5mm !important;
          }

          /* 뱃지 컨테이너 min-height 제거 (용지 맞춤으로 자동 늘어남) */
          td > div:last-child {
            min-height: 0 !important;
            height: 100% !important;
          }

          /* ━━━ 하단 비고란: 고정 높이로 하단 고정 ━━━ */
          .print-notes-wrap {
            flex-shrink: 0 !important;
            margin: 1mm 2mm 0 !important;
            border: 0.3mm solid rgba(0,0,0,0.15) !important;
            border-radius: 2mm !important;
            overflow: hidden !important;
          }
          .note-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .note-section p, .note-section span {
            font-size: 7pt !important;
            line-height: 1.4 !important;
          }
          .note-section [class*="px-4"] {
            padding: 1.5mm 2mm !important;
          }
          .note-section [class*="py-3"] {
            padding: 1mm 2mm !important;
          }
          .note-section [class*="py-2"] {
            padding: 0.5mm 2mm !important;
          }

          /* 스크롤 컨테이너 해제 */
          .overflow-y-auto,
          .overflow-x-auto {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── 하단 노트 섹션 컴포넌트
function NoteSection({
  title, value, editing, draft,
  onEdit, onDraftChange, onSave, onCancel,
  multiline, borderTop,
}: {
  title: string
  value: string
  editing: boolean
  draft: string
  onEdit: () => void
  onDraftChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  multiline: boolean
  borderTop?: boolean
}) {
  return (
    <div className={cn('bg-white note-section', borderTop && 'border-t border-black/10')}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#F9F9F9] border-b border-black/8">
        <span className="text-[13px] font-bold text-[#1C1C1E]">{title}</span>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F2F2F7] text-[#8E8E93] text-[12px] font-medium">
              <X className="w-3.5 h-3.5" />취소
            </button>
            <button onClick={onSave}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#34C759] text-white text-[12px] font-semibold">
              <Check className="w-3.5 h-3.5" />저장
            </button>
          </div>
        ) : (
          <button onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F2F2F7] text-[#007AFF] text-[12px] font-medium no-print">
            <Pencil className="w-3.5 h-3.5" />수정
          </button>
        )}
      </div>

      {/* 내용 */}
      <div className="px-4 py-3">
        {editing ? (
          multiline ? (
            <textarea
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              rows={6}
              className="w-full text-[13px] text-black bg-[#F2F2F7] rounded-xl px-3 py-2.5 outline-none resize-none leading-relaxed"
            />
          ) : (
            <input
              type="text"
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              className="w-full text-[13px] text-black bg-[#F2F2F7] rounded-xl px-3 py-2.5 outline-none"
            />
          )
        ) : (
          <p className="text-[13px] text-[#3C3C43] leading-relaxed whitespace-pre-wrap">{value}</p>
        )}
      </div>
    </div>
  )
}
