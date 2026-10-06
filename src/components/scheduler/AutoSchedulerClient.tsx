'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, ChevronRight, ChevronLeft,
  CheckCircle2, Circle, Wand2, Calendar, X, GripVertical, Edit2 as Edit3Icon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/* ══════════════════════════════════════════════
   공휴일 데이터 (한국 법정공휴일 — 대체휴일 포함 완전 목록)
   출처: 관공서의 공휴일에 관한 규정, timeanddate.com/publicholidays.co.kr 교차검증
   2024~2030 대체휴일 포함 확정 날짜 hardcoded
   ※ 2026년부터 노동절(5/1) + 제헌절(7/17) 법정공휴일 추가 (국회 의결 2026.01.29 시행)
══════════════════════════════════════════════ */

// 연도별 공휴일 완전 목록 (대체휴일 포함, MM-DD 형식)
const KR_HOLIDAYS: Record<number, string[]> = {
  2024: [
    '01-01', // 신정
    '02-09','02-10','02-11','02-12', // 설날 연휴 (대체휴일 포함)
    '03-01', // 삼일절
    '04-10', // 총선일
    '05-05','05-06', // 어린이날 + 대체(부처님오신날 겹침)
    '06-06', // 현충일
    '08-15', // 광복절
    '09-16','09-17','09-18', // 추석 연휴
    '10-03', // 개천절
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
  2025: [
    '01-01', // 신정
    '01-27','01-28','01-29','01-30', // 설날 연휴 (대체휴일 포함)
    '03-01', // 삼일절 (토 → 03-03 대체)
    '03-03', // 삼일절 대체휴일
    '05-05','05-06', // 어린이날 + 부처님오신날 (대체 05-06)
    '06-03', // 대선일
    '06-06', // 현충일
    '08-15', // 광복절
    '10-05','10-06','10-07','10-08', // 추석 연휴 + 대체휴일
    '10-03', // 개천절
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
  2026: [
    '01-01', // 신정
    '02-16','02-17','02-18', // 설날 연휴
    '03-01', // 삼일절 (일 → 03-02 대체)
    '03-02', // 삼일절 대체휴일
    '05-01', // 노동절 (2026년부터 법정공휴일)
    '05-05', // 어린이날
    '05-24', // 부처님오신날
    '05-25', // 부처님오신날 대체휴일
    '06-03', // 지방선거일
    '06-06', // 현충일
    '07-17', // 제헌절 (2026년 공휴일 재지정 확정, 2026.05.11 시행)
    '08-15', // 광복절 (토 → 08-17 대체)
    '08-17', // 광복절 대체휴일
    '09-24','09-25','09-26', // 추석 연휴
    '10-03', // 개천절 (토 → 10-05 대체)
    '10-05', // 개천절 대체휴일
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
  2027: [
    '01-01', // 신정
    '02-06','02-07','02-08','02-09', // 설날 연휴 (대체 포함)
    '03-01', // 삼일절
    '05-01', // 노동절
    '05-03', // 노동절 대체휴일 (토 → 월)
    '05-05', // 어린이날
    '05-13', // 부처님오신날
    '06-06', // 현충일 (일 → 06-07 대체)
    '06-07', // 현충일 대체휴일
    '08-15', // 광복절 (일 → 08-16 대체)
    '08-16', // 광복절 대체휴일
    '09-14','09-15','09-16', // 추석 연휴
    '10-03', // 개천절 (일 → 10-04 대체)
    '10-04', // 개천절 대체휴일
    '10-09', // 한글날 (토 → 10-11 대체)
    '10-11', // 한글날 대체휴일
    '12-25', // 성탄절 (토 → 12-27 대체)
    '12-27', // 성탄절 대체휴일
  ],
  2028: [
    '01-01', // 신정 (토 — 대체 없음, 신정은 대체 미적용)
    '01-26','01-27', // 설날 연휴
    '03-01', // 삼일절
    '05-01', // 노동절
    '05-02', // 부처님오신날
    '05-05', // 어린이날
    '06-06', // 현충일
    '07-17', // 제헌절 (공휴일)
    '08-15', // 광복절
    '10-02','10-03','10-04', // 추석 연휴 (개천절 겹침)
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
  2029: [
    '01-01', // 신정
    '02-12','02-13','02-14', // 설날 연휴
    '03-01', // 삼일절
    '05-01', // 노동절
    '05-05', // 어린이날 (토 → 05-07 대체)
    '05-07', // 어린이날 대체휴일
    '05-20', // 부처님오신날
    '05-21', // 부처님오신날 대체휴일
    '06-06', // 현충일
    '08-15', // 광복절
    '09-21','09-22','09-23','09-24', // 추석 연휴 + 대체
    '10-03', // 개천절
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
  2030: [
    '01-01', // 신정
    '02-04', // 설날
    '03-01', // 삼일절
    '05-01', // 노동절
    '05-05', // 어린이날 (일 → 05-07 대체)
    '05-07', // 어린이날 대체휴일
    '05-09', // 부처님오신날
    '06-06', // 현충일
    '08-15', // 광복절
    '09-11','09-12','09-13', // 추석 연휴
    '10-03', // 개천절
    '10-09', // 한글날
    '12-25', // 성탄절
  ],
}

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

interface HolidayOpts {
  saturday: boolean
  sunday: boolean
  holidays: boolean
  substitute: boolean
}

function getHolidaySet(year: number, opts: HolidayOpts): Set<string> {
  const set = new Set<string>()
  if (!opts.holidays) return set
  const list = KR_HOLIDAYS[year]
  if (list) {
    list.forEach(md => set.add(`${year}-${md}`))
  } else {
    // 2030 이후 fallback: 고정 공휴일만 (대체휴일 단순 계산)
    const FIXED: [number, number][] = [
      [1,1],[3,1],[5,5],[6,6],[8,15],[10,3],[10,9],[12,25],
    ]
    FIXED.forEach(([m, d]) => {
      const dateStr = `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      set.add(dateStr)
      if (opts.substitute) {
        const dt = new Date(year, m - 1, d)
        const day = dt.getDay()
        if (day === 0) { const nx = new Date(dt); nx.setDate(dt.getDate()+1); set.add(toYMD(nx)) }
        if (day === 6) { const nx = new Date(dt); nx.setDate(dt.getDate()+2); set.add(toYMD(nx)) }
      }
    })
  }
  return set
}

/** 영업일 기준으로 n일 추가 */
function addWorkDays(startDate: Date, days: number, opts: HolidayOpts, year: number): Date {
  const holidaySet = getHolidaySet(year, opts)
  // 다음 해 공휴일도 추가 (연도 걸칠 때)
  const nextYearHolidays = getHolidaySet(year + 1, opts)
  nextYearHolidays.forEach(h => holidaySet.add(h))

  let cur = new Date(startDate)
  let count = 0
  while (count < days) {
    cur = addDays(cur, 1)
    if (isWorkDay(cur, opts, holidaySet)) count++
  }
  return cur
}

function isWorkDay(d: Date, opts: HolidayOpts, holidaySet: Set<string>): boolean {
  const day = d.getDay()
  if (opts.saturday && day === 6) return false
  if (opts.sunday   && day === 0) return false
  if (opts.holidays && holidaySet.has(toYMD(d))) return false
  return true
}

/** 시작일에서 n 영업일 후의 날짜를 반환 (시작일 포함) */
function calcEndDate(startDate: string, days: number, opts: HolidayOpts): string {
  if (days <= 0) return startDate
  const sd = fromYMD(startDate)
  const year = sd.getFullYear()
  const holidaySet = getHolidaySet(year, opts)
  getHolidaySet(year+1, opts).forEach(h => holidaySet.add(h))

  let cur = new Date(sd)
  let count = 1 // 시작일 포함
  while (count < days) {
    cur = addDays(cur, 1)
    if (isWorkDay(cur, opts, holidaySet)) count++
  }
  return toYMD(cur)
}

/** 영업일 기준으로 날짜에서 n일 뒤 (다음 영업일) */
function nextWorkDay(dateStr: string, opts: HolidayOpts): string {
  const d = fromYMD(dateStr)
  const year = d.getFullYear()
  const holidaySet = getHolidaySet(year, opts)
  getHolidaySet(year+1, opts).forEach(h => holidaySet.add(h))
  let cur = addDays(d, 1)
  while (!isWorkDay(cur, opts, holidaySet)) cur = addDays(cur, 1)
  return toYMD(cur)
}

/** dateStr에서 영업일 기준으로 n일 앞으로 */
function subWorkDays(dateStr: string, n: number, opts: HolidayOpts): string {
  if (n <= 0) return dateStr
  const d = fromYMD(dateStr)
  const year = d.getFullYear()
  const holidaySet = getHolidaySet(year, opts)
  getHolidaySet(year+1, opts).forEach(h => holidaySet.add(h))
  let cur = new Date(d)
  let count = 0
  while (count < n) {
    cur = addDays(cur, -1)
    if (isWorkDay(cur, opts, holidaySet)) count++
  }
  return toYMD(cur)
}

/* ══════════════════════════════════════════════
   스케줄 자동 계산
══════════════════════════════════════════════ */
interface ProcessItem {
  id: string
  name: string
  days: number
  overlap: number   // 직전 공정과 겹치는 영업일수
  enabled: boolean
  color: string
  isPreWork: boolean // 철거 이전 공정 (역산 배치)
}

interface ScheduleResult {
  process: string
  color: string
  start_date: string
  end_date: string
  row_index: number
  row_type: string
  isPreWork: boolean
}

/**
 * 핵심 계산 로직
 *
 * 시작일(startDate) = 철거 시작일 기준
 * - isPreWork 공정: 철거 시작일 앞으로 역산 배치 (공사 기간에 포함 안됨 — 별도 표시)
 * - 일반 공정: 철거 시작일부터 순차 배치
 *
 * 겹침(overlap) 규칙:
 * - overlap > 0 → 직전 공정 종료일에서 (overlap-1)일 앞으로 당겨 시작 (체인)
 * - 1일짜리 공정도 겹침 허용: overlap > 0이면 직전 공정 종료일 기준으로 배치
 * - 행(row_index): 겹침 있으면 currentRow+1, 겹침 없으면 0으로 초기화
 */
function computeSchedule(
  items: ProcessItem[],
  startDate: string,   // 철거(첫 본공정) 시작일
  opts: HolidayOpts
): ScheduleResult[] {
  const results: ScheduleResult[] = []
  const enabled = items.filter(i => i.enabled && i.days > 0)
  if (enabled.length === 0) return results

  // ── 1. 순서 기반 isPreWork 자동 판정 ──
  // 공정 편집 리스트에서 첫 번째 비-isPreWork 공정(본공정) 보다 앞에 있는
  // 공정은 isPreWork 플래그와 무관하게 모두 철거 앞 역산 배치로 처리
  const firstMainIdx = enabled.findIndex(i => !i.isPreWork)
  // firstMainIdx === -1: 전부 isPreWork → 그냥 mainItems로 순차 배치
  const preWorkItems: ProcessItem[] = firstMainIdx > 0
    ? enabled.slice(0, firstMainIdx)
    : []
  const mainItems: ProcessItem[] = firstMainIdx >= 0
    ? enabled.slice(firstMainIdx)
    : enabled

  // 역산: 철거 시작일 하루 전 영업일부터 거꾸로
  if (preWorkItems.length > 0) {
    let curEndDate = subWorkDays(startDate, 1, opts) // 철거 하루 전
    // 역순으로 계산 (리스트 마지막 preWork부터 철거에 가깝게)
    const reversed = [...preWorkItems].reverse()
    const preResults: ScheduleResult[] = []

    for (const item of reversed) {
      const endDateStr   = curEndDate
      // 역산: endDate에서 (days-1)일 앞으로
      const startDateStr = subWorkDays(endDateStr, item.days - 1, opts)
      preResults.unshift({
        process:    item.name,
        color:      item.color,
        start_date: startDateStr,
        end_date:   endDateStr,
        row_index:  0,
        row_type:   'process',
        isPreWork:  true,
      })
      // 다음(더 앞) 공정의 종료일 = 현재 시작일 하루 전 영업일
      curEndDate = subWorkDays(startDateStr, 1, opts)
    }
    results.push(...preResults)
  }

  // ── 2. 본 공정 순차 배치 (철거부터) ──
  if (mainItems.length === 0) return results

  let prevEndDate = subWorkDays(startDate, 1, opts) // 첫 공정은 startDate부터 시작
  let currentRow  = 0
  // 그룹 내 가장 늦은 종료일 (겹침 그룹 끝나면 기준점 갱신)
  let groupLatestEnd = prevEndDate

  for (let i = 0; i < mainItems.length; i++) {
    const item = mainItems[i]
    let startDateStr: string

    if (i === 0) {
      // 첫 본공정 = 철거 시작일
      startDateStr = startDate
      currentRow   = 0
    } else if (item.overlap > 0) {
      // 겹침: 직전 공정 종료일에서 (overlap-1) 영업일 앞으로 당겨 시작
      // 1일짜리도 허용 — overlap=1이면 prevEndDate 그대로 (같은날 시작)
      startDateStr = subWorkDays(prevEndDate, item.overlap - 1, opts)
      currentRow++
    } else {
      // 겹침 없음: 그룹 내 가장 늦은 종료일 다음 영업일, 행 초기화
      startDateStr   = nextWorkDay(groupLatestEnd, opts)
      currentRow     = 0
      groupLatestEnd = groupLatestEnd // 초기화는 아래서
    }

    const endDateStr = calcEndDate(startDateStr, item.days, opts)

    results.push({
      process:    item.name,
      color:      item.color,
      start_date: startDateStr,
      end_date:   endDateStr,
      row_index:  currentRow,
      row_type:   currentRow >= 4 ? 'task' : 'process',
      isPreWork:  false,
    })

    prevEndDate = endDateStr

    // 그룹 내 가장 늦은 종료일 갱신
    if (endDateStr > groupLatestEnd) groupLatestEnd = endDateStr

    // 다음 공정이 겹침 없음이면 → groupLatestEnd를 현재 그룹 최대로 확정
    const nextItem = mainItems[i + 1]
    if (!nextItem || nextItem.overlap === 0) {
      groupLatestEnd = endDateStr
      // 결과 전체 중 최신 종료일로 보정
      for (const r of results) {
        if (!r.isPreWork && r.end_date > groupLatestEnd) groupLatestEnd = r.end_date
      }
    }
  }

  return results
}

/* ══════════════════════════════════════════════
   상수 — 기본 공정 목록
══════════════════════════════════════════════ */
const PROCESS_COLORS: Record<string, string> = {
  '가설공사':'#8E8E93','보양':'#8E8E93','철거':'#FF3B30','바닥철거':'#FF6B35',
  '경량철골':'#636366','금속·창호':'#FF9500','소방':'#FF3B30',
  '설비':'#32ADE6','전기':'#FFD60A','냉난방':'#30B0C7',
  '목작업':'#A2845E','문시공':'#8B6914','필름':'#BF5AF2','타일시공':'#5AC8FA',
  '타일':'#5AC8FA','욕실천장':'#30B0C7','탄성코트':'#FF6B35','휴젠트':'#C9A96E',
  '도장':'#FF2D55','도배':'#FF6B9D','마루':'#C9A96E',
  '조명':'#FF9F0A','가구':'#34C759','간판':'#FF9500','마무리':'#636366','실리콘':'#636366',
  '준공청소':'#00C7BE','잔손보기':'#FF9500','가전':'#007AFF',
  '도기시공':'#5AC8FA','방수':'#32ADE6','현장정리':'#00C7BE','가전설치':'#007AFF','폐기물반출':'#FF6B35',
  '중문시공':'#636366','거울시공':'#30B0C7','금속':'#FF9500',
  '홈스타일링':'#BF5AF2','촬영':'#007AFF','오픈하우스':'#34C759','현장미팅':'#007AFF',
  '스케줄 거래처':'#5856D6','현장 스케줄':'#007AFF',
  '계약':'#34C759','기타':'#8E8E93',
}

// 철거 이전 공정 이름 집합 (isPreWork 자동 판별용)
const PRE_WORK_NAMES = new Set(['가설공사','보양','엘리베이터보양','바닥보양','이사','입주청소준비'])

const DEFAULT_PROCESSES: Omit<ProcessItem, 'id'>[] = [
  { name:'가설공사',  days:2,  overlap:0, enabled:false, color:'#8E8E93', isPreWork:true  },
  { name:'철거',      days:3,  overlap:0, enabled:true,  color:'#FF3B30', isPreWork:false },
  { name:'바닥철거',  days:1,  overlap:0, enabled:true,  color:'#FF6B35', isPreWork:false },
  { name:'경량철골',  days:3,  overlap:0, enabled:false, color:'#636366', isPreWork:false },
  { name:'소방',      days:2,  overlap:0, enabled:false, color:'#FF3B30', isPreWork:false },
  { name:'설비',      days:4,  overlap:0, enabled:true,  color:'#32ADE6', isPreWork:false },
  { name:'전기',      days:4,  overlap:0, enabled:true,  color:'#FFD60A', isPreWork:false },
  { name:'냉난방',    days:3,  overlap:0, enabled:true,  color:'#30B0C7', isPreWork:false },
  { name:'목작업',    days:5,  overlap:0, enabled:true,  color:'#A2845E', isPreWork:false },
  { name:'문시공',    days:2,  overlap:0, enabled:true,  color:'#8B6914', isPreWork:false },
  { name:'필름',      days:3,  overlap:0, enabled:true,  color:'#BF5AF2', isPreWork:false },
  { name:'타일',      days:4,  overlap:0, enabled:true,  color:'#5AC8FA', isPreWork:false },
  { name:'욕실천장',  days:2,  overlap:0, enabled:false, color:'#30B0C7', isPreWork:false },
  { name:'탄성코트',  days:2,  overlap:0, enabled:false, color:'#FF6B35', isPreWork:false },
  { name:'휴젠트',    days:2,  overlap:0, enabled:false, color:'#C9A96E', isPreWork:false },
  { name:'도장',      days:3,  overlap:0, enabled:true,  color:'#FF2D55', isPreWork:false },
  { name:'도배',      days:3,  overlap:0, enabled:true,  color:'#FF6B9D', isPreWork:false },
  { name:'마루',      days:2,  overlap:0, enabled:true,  color:'#C9A96E', isPreWork:false },
  { name:'조명',      days:2,  overlap:0, enabled:true,  color:'#FF9F0A', isPreWork:false },
  { name:'가구',      days:3,  overlap:0, enabled:true,  color:'#34C759', isPreWork:false },
  { name:'마무리',    days:2,  overlap:0, enabled:false, color:'#636366', isPreWork:false },
  { name:'간판',      days:1,  overlap:0, enabled:false, color:'#FF9500', isPreWork:false },
  { name:'준공청소',  days:1,  overlap:0, enabled:true,  color:'#00C7BE', isPreWork:false },
  { name:'잔손보기',  days:2,  overlap:0, enabled:true,  color:'#FF9500', isPreWork:false },
  { name:'가전',      days:1,  overlap:0, enabled:false, color:'#007AFF', isPreWork:false },
  { name:'도기시공',  days:2,  overlap:0, enabled:false, color:'#5AC8FA', isPreWork:false },
  { name:'방수',      days:2,  overlap:0, enabled:false, color:'#32ADE6', isPreWork:false },
  { name:'현장정리',  days:1,  overlap:0, enabled:false, color:'#00C7BE', isPreWork:false },
  { name:'가전설치',  days:1,  overlap:0, enabled:false, color:'#007AFF', isPreWork:false },
  { name:'폐기물반출',days:1, overlap:0, enabled:false, color:'#FF6B35', isPreWork:false },
  { name:'중문시공',  days:2,  overlap:0, enabled:false, color:'#636366', isPreWork:false },
  { name:'거울시공',  days:1,  overlap:0, enabled:false, color:'#30B0C7', isPreWork:false },
  { name:'금속',      days:3,  overlap:0, enabled:false, color:'#FF9500', isPreWork:false },
  { name:'홈스타일링',days:1,  overlap:0, enabled:false, color:'#BF5AF2', isPreWork:false },
  { name:'촬영',      days:1,  overlap:0, enabled:false, color:'#007AFF', isPreWork:false },
  { name:'오픈하우스',days:1,  overlap:0, enabled:false, color:'#34C759', isPreWork:false },
]

const ALL_PROCESS_NAMES = Object.keys(PROCESS_COLORS)

let _uid = 1
function uid() { return String(_uid++) }

/* ══════════════════════════════════════════════
   스타일 상수
══════════════════════════════════════════════ */
const inputCls = 'w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]'
const labelCls = 'text-[11px] text-[#8E8E93] font-medium mb-1 block'

/* ══════════════════════════════════════════════
   영업일 수 계산 (start~end 사이 isWorkDay 개수)
══════════════════════════════════════════════ */
function countWorkDays(startStr: string, endStr: string, opts: HolidayOpts): number {
  const sd = fromYMD(startStr)
  const ed = fromYMD(endStr)
  const year = sd.getFullYear()
  const holidaySet = getHolidaySet(year, opts)
  getHolidaySet(year + 1, opts).forEach(h => holidaySet.add(h))
  let count = 0
  let cur = new Date(sd)
  while (cur <= ed) {
    if (isWorkDay(cur, opts, holidaySet)) count++
    cur = addDays(cur, 1)
  }
  return Math.max(1, count)
}

/* ══════════════════════════════════════════════
   두 날짜 사이 겹침 영업일 역산
   prevEnd >= curStart 이면 겹침 발생
   overlap = prevEnd에서 curStart까지 영업일 차이 + 1
══════════════════════════════════════════════ */
function calcOverlap(prevEndStr: string, curStartStr: string, opts: HolidayOpts): number {
  const prevEnd  = fromYMD(prevEndStr)
  const curStart = fromYMD(curStartStr)
  if (curStart > prevEnd) return 0  // 겹침 없음
  // 겹치는 경우: prevEnd ~ curStart 사이 영업일 수 (curStart 포함)
  // overlap = prevEnd에서 curStart 사이 영업일 개수
  const year = prevEnd.getFullYear()
  const holidaySet = getHolidaySet(year, opts)
  getHolidaySet(year + 1, opts).forEach(h => holidaySet.add(h))
  let overlap = 0
  let cur = new Date(curStart)
  while (cur <= prevEnd) {
    if (isWorkDay(cur, opts, holidaySet)) overlap++
    cur = addDays(cur, 1)
  }
  return Math.max(1, overlap)
}

/* ══════════════════════════════════════════════
   기존 스케줄에서 ProcessItem 역산
   - 영업일 기준 일수 정확 계산
   - 겹침(overlap) 역산 복원
══════════════════════════════════════════════ */
function schedulesToItems(
  schedules: any[],
  opts: HolidayOpts = { saturday: true, sunday: true, holidays: true, substitute: true }
): { items: ProcessItem[]; startDate: string } {
  if (schedules.length === 0) return { items: DEFAULT_PROCESSES.map(p=>({...p,id:uid()})), startDate: toYMD(new Date()) }

  // start_date 기준 오름차순 정렬 (row_index=0 우선 → 이후 row_index 순)
  const sorted = [...schedules].sort((a, b) => {
    const aStart = a.start_date || a.date
    const bStart = b.start_date || b.date
    // 같은 시작일이면 row_index 낮은 순
    if (aStart === bStart) return (a.row_index ?? 0) - (b.row_index ?? 0)
    return aStart < bStart ? -1 : 1
  })

  // 철거 공정 찾기 (process === '철거') 또는 row_index=0 중 가장 이른 것
  const byStart = [...sorted]
  const demolish = byStart.find(s => s.process === '철거' || (s.row_index === 0 && !PRE_WORK_NAMES.has(s.process)))
  const startDate = demolish
    ? (demolish.start_date || demolish.date)
    : (byStart[0]?.start_date || byStart[0]?.date || toYMD(new Date()))

  // 각 공정을 ProcessItem으로 변환 — 영업일 기준 일수 + 겹침 역산
  const items: ProcessItem[] = sorted.map((s, idx) => {
    const sd = s.start_date || s.date
    const ed = s.end_date   || s.date

    // ① 영업일 기준 일수
    const days = countWorkDays(sd, ed, opts)

    // ② 겹침 역산: 바로 직전 공정(row_index가 가장 낮은 행의 순서상 직전)과 비교
    // 현재 공정의 row_index > 0 이면 겹침 공정 — 직전 row_index(=row_index-1) 공정 찾기
    let overlap = 0
    if (idx > 0 && (s.row_index ?? 0) > 0) {
      // 직전 공정 = sorted 배열에서 idx-1번째
      const prev = sorted[idx - 1]
      const prevEnd = prev.end_date || prev.date
      overlap = calcOverlap(prevEnd, sd, opts)
    }

    return {
      id: uid(),
      name: s.process,
      days,
      overlap,
      enabled: true,
      color: s.color ?? PROCESS_COLORS[s.process] ?? '#8E8E93',
      isPreWork: PRE_WORK_NAMES.has(s.process) || fromYMD(sd) < fromYMD(startDate),
    }
  })

  return { items, startDate }
}

/* ══════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════ */
interface Props { profile: any }

type AppMode = 'home' | 'new' | 'edit'

export function AutoSchedulerClient({ profile }: Props) {
  const supabase    = createClient()
  const queryClient = useQueryClient()

  // ── 모드 선택
  const [mode, setMode] = useState<AppMode>('home')
  const [step, setStep] = useState<1|2|3>(1)

  // ── 수정 모드: 선택된 현장 + 기존 스케줄 ID 목록
  const [editProjectId,   setEditProjectId]   = useState('')
  const [existingIds,     setExistingIds]     = useState<string[]>([])

  // STEP 1 상태
  const [projectId,    setProjectId]    = useState('')
  const [startDate,    setStartDate]    = useState(toYMD(new Date()))
  const [holidayOpts,  setHolidayOpts]  = useState<HolidayOpts>({
    saturday: true, sunday: true, holidays: true, substitute: true,
  })

  // STEP 2 상태
  const [items, setItems] = useState<ProcessItem[]>(
    DEFAULT_PROCESSES.map(p => ({ ...p, id: uid() }))
  )
  const [addModalOpen,  setAddModalOpen]  = useState(false)
  const [addInsertIdx,  setAddInsertIdx]  = useState<number>(-1)
  const [addName,       setAddName]       = useState('')
  const [addPickName,   setAddPickName]   = useState('')

  // STEP 3
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult[]>([])

  // ── 현장 목록
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-auto', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('id,name,status')
        .eq('company_id', profile.company_id)
        .neq('status','완료').order('created_at',{ascending:false})
      if (error) throw error
      return data || []
    },
  })

  // ── 수정 모드: 선택된 현장의 스케줄 목록 조회
  const { data: editSchedules = [], isLoading: editLoading } = useQuery({
    queryKey: ['schedules-for-edit', editProjectId],
    queryFn: async () => {
      if (!editProjectId) return []
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('project_id', editProjectId)
        .order('start_date', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!editProjectId,
  })

  // 수정 모드: 현장 선택 시 스케줄 로드
  const loadEditSchedules = () => {
    if (!editProjectId) { toast.error('수정할 현장을 선택하세요'); return }
    if (editSchedules.length === 0) { toast.error('해당 현장에 등록된 스케줄이 없습니다'); return }
    const { items: loadedItems, startDate: loadedStart } = schedulesToItems(editSchedules)
    setExistingIds(editSchedules.map((s:any) => s.id))
    setProjectId(editProjectId)
    setStartDate(loadedStart)
    setItems(loadedItems)
    setMode('edit'); setStep(1)
  }

  // ── 등록 mutation (새로 만들기)
  const registerMutation = useMutation({
    mutationFn: async ({ rows, deleteIds }: { rows: ScheduleResult[]; deleteIds: string[] }) => {
      // 수정 모드면 기존 스케줄 삭제 후 재등록
      if (deleteIds.length > 0) {
        const { error } = await supabase.from('schedules').delete().in('id', deleteIds)
        if (error) throw error
      }
      const inserts = rows.map(r => ({
        company_id:  profile.company_id,
        created_by:  profile.id,
        project_id:  projectId,
        date:        r.start_date,
        start_date:  r.start_date,
        end_date:    r.end_date,
        row_index:   r.row_index,
        row_type:    r.row_type,
        process:     r.process,
        color:       r.color,
        worker_name: '',
        memo:        '',
        status:      '예정',
      }))
      const { error } = await supabase.from('schedules').insert(inserts)
      if (error) throw error
    },
    onSuccess: () => {
      const isEdit = existingIds.length > 0
      toast.success(isEdit
        ? `스케줄이 수정됐습니다! (${scheduleResult.length}개 공정)`
        : `${scheduleResult.length}개 공정이 스케줄러에 등록됐습니다!`)
      queryClient.invalidateQueries({ queryKey: ['schedules-v2'] })
      queryClient.invalidateQueries({ queryKey: ['schedules-for-edit'] })
      resetAll()
    },
    onError: (e: any) => toast.error(e.message || '저장 실패'),
  })

  const resetAll = () => {
    setMode('home'); setStep(1)
    setProjectId(''); setStartDate(toYMD(new Date()))
    setScheduleResult([]); setExistingIds([])
    setEditProjectId('')
    setItems(DEFAULT_PROCESSES.map(p => ({ ...p, id: uid() })))
  }

  /* ── STEP 2 핸들러 ── */
  const updateItem = useCallback((id: string, patch: Partial<ProcessItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }, [])
  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])
  const addItemAt = (idx: number, name: string) => {
    if (!name.trim()) return
    const color = PROCESS_COLORS[name] ?? '#8E8E93'
    const newItem: ProcessItem = {
      id: uid(), name: name.trim(), days: 2, overlap: 0, enabled: true, color,
      isPreWork: PRE_WORK_NAMES.has(name.trim()),
    }
    setItems(prev => {
      const next = [...prev]
      next.splice(idx === -1 ? next.length : idx + 1, 0, newItem)
      return next
    })
    setAddModalOpen(false); setAddName(''); setAddPickName('')
  }
  const moveItem = useCallback((fromIdx: number, toIdx: number) => {
    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [])

  /* ── STEP 전환 ── */
  const goStep2 = () => {
    if (!projectId) { toast.error('현장을 선택하세요'); return }
    if (!startDate) { toast.error('철거 시작일을 선택하세요'); return }
    setStep(2)
  }
  const goStep3 = () => {
    const enabled = items.filter(i => i.enabled)
    if (enabled.length === 0) { toast.error('최소 1개 이상의 공정을 선택하세요'); return }
    if (enabled.some(i => i.days <= 0)) { toast.error('공정 일수는 1일 이상이어야 합니다'); return }
    const result = computeSchedule(items, startDate, holidayOpts)
    setScheduleResult(result)
    setStep(3)
  }

  const projName = projects.find((p:any) => p.id === projectId)?.name ?? ''
  const isEditMode = mode === 'edit'

  /* ══ 홈 화면 ══ */
  if (mode === 'home') {
    return (
      <div className="flex flex-col h-full bg-[#F2F2F7]">
        {/* 헤더 */}
        <div className="bg-white border-b border-black/5 px-5 pt-4 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-[#007AFF]" />
            <span className="text-[18px] font-bold text-[#1C1C1E]">스케줄 자동 생성</span>
          </div>
          <p className="text-[12px] text-[#8E8E93] mt-1">무엇을 하시겠습니까?</p>
        </div>

        <div className="flex-1 px-5 py-6 space-y-4">
          {/* 새로 만들기 */}
          <button
            onClick={() => { setMode('new'); setStep(1); setItems(DEFAULT_PROCESSES.map(p=>({...p,id:uid()}))) }}
            className="w-full bg-white rounded-2xl border border-black/8 shadow-sm p-5 flex items-start gap-4 active:opacity-70 text-left">
            <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center flex-shrink-0">
              <Plus className="w-6 h-6 text-[#007AFF]" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-[#1C1C1E]">새로 만들기</p>
              <p className="text-[13px] text-[#8E8E93] mt-0.5">현장을 선택하고 공정 일정을 처음부터 자동 생성합니다</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#C7C7CC] flex-shrink-0 self-center ml-auto" />
          </button>

          {/* 수정하기 */}
          <div className="bg-white rounded-2xl border border-black/8 shadow-sm overflow-hidden">
            <div className="p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 flex items-center justify-center flex-shrink-0">
                <Edit3Icon className="w-6 h-6 text-[#FF9500]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[16px] font-bold text-[#1C1C1E]">수정하기</p>
                <p className="text-[13px] text-[#8E8E93] mt-0.5">기존에 등록된 스케줄을 불러와 수정합니다</p>
              </div>
            </div>

            {/* 현장 선택 드롭다운 */}
            <div className="px-5 pb-5 space-y-3">
              <select
                value={editProjectId}
                onChange={e => setEditProjectId(e.target.value)}
                className={inputCls}>
                <option value="">수정할 현장을 선택하세요</option>
                {projects.map((p:any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* 선택된 현장의 스케줄 미리보기 */}
              {editProjectId && (
                <div className="rounded-xl bg-[#F8F9FA] border border-black/5 px-3 py-2.5">
                  {editLoading ? (
                    <p className="text-[12px] text-[#8E8E93]">스케줄 불러오는 중...</p>
                  ) : editSchedules.length === 0 ? (
                    <p className="text-[12px] text-[#FF3B30]">등록된 스케줄이 없습니다</p>
                  ) : (
                    <div>
                      <p className="text-[11px] text-[#8E8E93] mb-1.5">등록된 공정 {editSchedules.length}개</p>
                      <div className="flex flex-wrap gap-1">
                        {editSchedules.slice(0, 8).map((s:any, i:number) => (
                          <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: s.color ?? '#8E8E93' }}>
                            {s.process}
                          </span>
                        ))}
                        {editSchedules.length > 8 && (
                          <span className="text-[11px] text-[#8E8E93] px-1">+{editSchedules.length-8}개</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={loadEditSchedules}
                disabled={!editProjectId || editLoading || editSchedules.length === 0}
                className="w-full py-3 bg-[#FF9500] text-white text-[15px] font-bold rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-30">
                <Edit3Icon className="w-4 h-4" />
                불러와서 수정하기
              </button>
            </div>
          </div>

          {/* 안내 */}
          <div className="px-2 py-3 rounded-xl bg-[#F0F7FF] border border-[#007AFF]/10">
            <p className="text-[11px] text-[#007AFF] leading-relaxed">
              💡 <b>수정하기</b>를 사용하면 기존 스케줄을 삭제하고 새로 생성합니다.<br/>
              담당자·메모 등 세부 정보는 스케줄러에서 직접 수정하세요.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">

      {/* ── 헤더 */}
      <div className="bg-white border-b border-black/5 px-4 pt-3 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={resetAll} className="p-1 -ml-1 active:opacity-60">
            <ChevronLeft className="w-5 h-5 text-[#007AFF]" />
          </button>
          <Wand2 className="w-4 h-4 text-[#007AFF]" />
          <span className="text-[16px] font-bold text-[#1C1C1E]">
            {isEditMode ? '스케줄 수정' : '새 스케줄 생성'}
          </span>
          {isEditMode && (
            <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500]">
              수정모드
            </span>
          )}
        </div>
        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-1 mt-2.5">
          {(['현장·설정','공정 편집','미리보기·등록'] as const).map((label, idx) => {
            const stepNum = (idx + 1) as 1|2|3
            const active  = step === stepNum
            const done    = step > stepNum
            return (
              <div key={idx} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => { if (done) setStep(stepNum) }}
                  disabled={!done}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold flex-1 justify-center',
                    active ? (isEditMode ? 'bg-[#FF9500] text-white' : 'bg-[#007AFF] text-white') :
                    done   ? 'bg-[#34C759]/15 text-[#34C759]' :
                             'bg-[#F2F2F7] text-[#8E8E93]'
                  )}>
                  {done
                    ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    : <span className={cn('w-4 h-4 rounded-full text-[10px] flex items-center justify-center flex-shrink-0 border',
                        active ? 'border-white text-white' : 'border-[#C7C7CC] text-[#8E8E93]'
                      )}>{stepNum}</span>
                  }
                  {label}
                </button>
                {idx < 2 && <ChevronRight className="w-3 h-3 text-[#C7C7CC] flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ STEP 1 ══ */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

            {/* 수정 모드 안내 */}
            {isEditMode && (
              <div className="px-3 py-2.5 rounded-xl bg-[#FF9500]/8 border border-[#FF9500]/20">
                <p className="text-[12px] text-[#FF9500] font-medium">
                  ✏️ 수정 모드 — 기존 공정을 불러왔습니다.<br/>
                  <span className="font-normal">공정 편집 후 저장하면 기존 스케줄이 교체됩니다.</span>
                </p>
              </div>
            )}

            {/* 현장 선택 */}
            <div>
              <label className={labelCls}>현장 선택 *</label>
              {isEditMode ? (
                <div className="px-3 py-2.5 rounded-xl bg-[#F2F2F7] border border-black/10 text-[14px] font-medium text-black">
                  {projName}
                </div>
              ) : (
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                  <option value="">현장을 선택하세요</option>
                  {projects.map((p:any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* 철거 시작일 */}
            <div>
              <label className={labelCls}>철거 시작일 *</label>
              <input type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={inputCls} />
              <p className="text-[11px] text-[#8E8E93] mt-1.5 flex items-start gap-1">
                <span className="text-[#FF9500] flex-shrink-0">ℹ️</span>
                가설공사·보양 등 사전 공정은 이 날짜 기준으로 앞에 자동 배치됩니다
              </p>
            </div>

            {/* 휴일 제외 옵션 */}
            <div>
              <label className={labelCls}>공정 진행 제외 (건너뛰기)</label>
              <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
                {([
                  { key:'saturday',   label:'토요일',     desc:'매주 토요일 공정 없음' },
                  { key:'sunday',     label:'일요일',     desc:'매주 일요일 공정 없음' },
                  { key:'holidays',   label:'법정공휴일', desc:'국경일·명절 등 법정공휴일' },
                  { key:'substitute', label:'대체휴일',   desc:'공휴일이 주말과 겹칠 때' },
                ] as const).map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => setHolidayOpts(o => ({ ...o, [opt.key]: !o[opt.key] }))}
                    className="w-full flex items-center justify-between px-4 py-3 active:bg-black/3">
                    <div className="text-left">
                      <p className="text-[14px] font-medium text-black">{opt.label}</p>
                      <p className="text-[11px] text-[#8E8E93]">{opt.desc}</p>
                    </div>
                    <div className={cn(
                      'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
                      holidayOpts[opt.key] ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'
                    )}>
                      <div className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        holidayOpts[opt.key] ? 'translate-x-5' : 'translate-x-0.5'
                      )} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 다음 버튼 */}
            <button onClick={goStep2}
              className={cn(
                'w-full py-4 text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-2 active:opacity-80',
                isEditMode ? 'bg-[#FF9500]' : 'bg-[#007AFF]'
              )}>
              공정 편집하기
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP 2 ══ */}
      {step === 2 && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 서브헤더 */}
          <div className="bg-white px-4 py-2.5 border-b border-black/5 flex items-center justify-between flex-shrink-0">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[#007AFF] text-[14px]">
              <ChevronLeft className="w-4 h-4" />이전
            </button>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-black">{projName}</p>
              <p className="text-[11px] text-[#8E8E93]">시작일 {startDate}</p>
            </div>
            <button onClick={goStep3}
              className="text-[#007AFF] text-[14px] font-semibold">
              다음
            </button>
          </div>

          {/* 안내 */}
          <div className="px-4 py-2 bg-[#F0F7FF] border-b border-[#007AFF]/10 flex-shrink-0">
            <p className="text-[11px] text-[#007AFF]">
              ✅ 포함할 공정을 선택하고 일수와 겹침일수를 입력하세요
            </p>
          </div>

          {/* 공정 리스트 */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-3 space-y-1.5">

              {items.map((item, idx) => (
                <ProcessRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  total={items.length}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onDelete={() => deleteItem(item.id)}
                  onMoveUp={() => idx > 0 && moveItem(idx, idx-1)}
                  onMoveDown={() => idx < items.length-1 && moveItem(idx, idx+1)}
                  onInsertAfter={() => { setAddInsertIdx(idx); setAddModalOpen(true) }}
                />
              ))}

              {/* 맨 아래 추가 버튼 */}
              <button
                onClick={() => { setAddInsertIdx(-1); setAddModalOpen(true) }}
                className="w-full py-3 border-2 border-dashed border-[#007AFF]/30 rounded-2xl flex items-center justify-center gap-2 text-[#007AFF] text-[13px] font-semibold active:opacity-60 mt-2">
                <Plus className="w-4 h-4" />공정 추가
              </button>
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="flex-shrink-0 px-4 pb-safe pt-3 border-t border-black/5 bg-white">
            <button onClick={goStep3}
              className={cn(
                'w-full py-4 text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-2 active:opacity-80',
                isEditMode ? 'bg-[#FF9500]' : 'bg-[#007AFF]'
              )}>
              <Calendar className="w-5 h-5" />
              미리보기 생성
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP 3 ══ */}
      {step === 3 && (
        <Step3Preview
          results={scheduleResult}
          projName={projName}
          startDate={startDate}
          isEditMode={isEditMode}
          existingIds={existingIds}
          isRegistering={registerMutation.isPending}
          onBack={() => setStep(2)}
          onRegister={() => registerMutation.mutate({ rows: scheduleResult, deleteIds: existingIds })}
        />
      )}

      {/* ── 공정 추가 모달 */}
      <AddProcessModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddName(''); setAddPickName('') }}
        addName={addName}
        setAddName={setAddName}
        addPickName={addPickName}
        setAddPickName={setAddPickName}
        onAdd={(name) => addItemAt(addInsertIdx, name)}
        insertAfterLabel={addInsertIdx >= 0 ? `"${items[addInsertIdx]?.name}" 다음에 추가` : '맨 끝에 추가'}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════
   공정 행 컴포넌트
══════════════════════════════════════════════ */
function ProcessRow({ item, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown, onInsertAfter }: {
  item: ProcessItem; idx: number; total: number
  onUpdate: (p: Partial<ProcessItem>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onInsertAfter: () => void
}) {
  return (
    <div className={cn(
      'rounded-2xl border transition-all',
      item.enabled
        ? item.isPreWork
          ? 'bg-[#FFF9F0] border-[#FF9500]/20 shadow-sm'
          : 'bg-white border-black/8 shadow-sm'
        : 'bg-[#F8F8F8] border-black/5'
    )}>
      {/* 상단 행: 체크 + 이름 + 사전공정배지 + 이동 + 삭제 */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        {/* 체크박스 */}
        <button type="button" onClick={() => onUpdate({ enabled: !item.enabled })}
          className="flex-shrink-0">
          {item.enabled
            ? <CheckCircle2 className="w-5 h-5" style={{ color: item.color }} />
            : <Circle className="w-5 h-5 text-[#C7C7CC]" />
          }
        </button>

        {/* 색상 점 + 공정명 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
          <span className={cn(
            'text-[14px] font-semibold truncate',
            item.enabled ? 'text-[#1C1C1E]' : 'text-[#C7C7CC]'
          )}>{item.name}</span>
          {/* 사전공정 배지 */}
          {item.enabled && item.isPreWork && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] flex-shrink-0">
              철거前
            </span>
          )}
        </div>

        {/* 사전공정 토글 */}
        {item.enabled && (
          <button type="button"
            onClick={() => onUpdate({ isPreWork: !item.isPreWork })}
            className={cn(
              'text-[9px] font-bold px-1.5 py-1 rounded-lg border transition-all flex-shrink-0',
              item.isPreWork
                ? 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20'
                : 'bg-[#F2F2F7] text-[#8E8E93] border-black/8'
            )}>
            {item.isPreWork ? '앞배치' : '순차'}
          </button>
        )}

        {/* 위아래 이동 */}
        <div className="flex gap-0.5">
          <button type="button" onClick={onMoveUp} disabled={idx === 0}
            className="p-1 rounded-lg active:bg-black/5 disabled:opacity-20">
            <ChevronLeft className="w-3.5 h-3.5 text-[#8E8E93] rotate-90" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={idx === total-1}
            className="p-1 rounded-lg active:bg-black/5 disabled:opacity-20">
            <ChevronRight className="w-3.5 h-3.5 text-[#8E8E93] rotate-90" />
          </button>
        </div>

        {/* 삭제 */}
        <button type="button" onClick={onDelete}
          className="p-1 rounded-lg active:bg-[#FF3B30]/10">
          <Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" />
        </button>
      </div>

      {/* 하단 행: 일수 + 겹침 */}
      {item.enabled && (
        <div className="flex items-center gap-2 px-3 pb-2.5">
          {/* 일수 */}
          <div className="flex-1">
            <p className="text-[10px] text-[#8E8E93] mb-1">공정 일수</p>
            <div className="flex items-center gap-1.5">
              <button type="button"
                onClick={() => onUpdate({ days: Math.max(1, item.days - 1) })}
                className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center text-[16px] font-bold text-[#3C3C43] active:bg-black/10">
                −
              </button>
              <input
                type="number" min={1} max={99} value={item.days}
                onChange={e => onUpdate({ days: Math.max(1, parseInt(e.target.value)||1) })}
                className="w-10 text-center text-[14px] font-bold text-[#1C1C1E] border border-black/10 rounded-lg py-1 bg-white outline-none"
              />
              <button type="button"
                onClick={() => onUpdate({ days: Math.min(99, item.days + 1) })}
                className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center text-[16px] font-bold text-[#3C3C43] active:bg-black/10">
                +
              </button>
              <span className="text-[11px] text-[#8E8E93]">일</span>
            </div>
          </div>

          {/* 겹침 — 사전공정(isPreWork)은 겹침 미표시 */}
          {!item.isPreWork && (
            <div className="flex-1">
              <p className="text-[10px] text-[#8E8E93] mb-1">직전 공정과 겹침</p>
              <div className="flex items-center gap-1.5">
                <button type="button"
                  onClick={() => onUpdate({ overlap: Math.max(0, item.overlap - 1) })}
                  className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center text-[16px] font-bold text-[#3C3C43] active:bg-black/10">
                  −
                </button>
                <input
                  type="number" min={0} max={99} value={item.overlap}
                  onChange={e => onUpdate({ overlap: Math.max(0, parseInt(e.target.value)||0) })}
                  className={cn(
                    'w-10 text-center text-[14px] font-bold border rounded-lg py-1 outline-none',
                    item.overlap > 0 ? 'text-[#FF9500] border-[#FF9500]/30 bg-[#FF9500]/5' : 'text-[#1C1C1E] border-black/10 bg-white'
                  )}
                />
                <button type="button"
                  onClick={() => onUpdate({ overlap: item.overlap + 1 })}
                  className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center text-[16px] font-bold text-[#3C3C43] active:bg-black/10">
                  +
                </button>
                <span className="text-[11px] text-[#8E8E93]">일</span>
              </div>
            </div>
          )}

          {/* 겹침 배지 */}
          {!item.isPreWork && item.overlap > 0 && (
            <div className="flex-shrink-0 self-end pb-0.5">
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#FF9500]/10 text-[#FF9500]">
                ↑{item.overlap}일 겹침
              </span>
            </div>
          )}

          {/* 사전공정 안내 */}
          {item.isPreWork && (
            <div className="flex-1 flex items-end pb-0.5">
              <span className="text-[10px] text-[#FF9500]">철거일 기준 앞으로 역산 배치</span>
            </div>
          )}
        </div>
      )}

      {/* 공정 추가 버튼 (행 사이) */}
      <div className="flex justify-center pb-1 -mb-3.5 relative z-10">
        <button type="button" onClick={onInsertAfter}
          className="flex items-center gap-0.5 px-2 py-0.5 bg-white border border-[#007AFF]/30 rounded-full text-[10px] text-[#007AFF] shadow-sm active:opacity-60">
          <Plus className="w-2.5 h-2.5" />추가
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   공정 추가 모달
══════════════════════════════════════════════ */
function AddProcessModal({ open, onClose, addName, setAddName, addPickName, setAddPickName, onAdd, insertAfterLabel }: {
  open: boolean; onClose: () => void
  addName: string; setAddName: (v:string) => void
  addPickName: string; setAddPickName: (v:string) => void
  onAdd: (name:string) => void
  insertAfterLabel: string
}) {
  const finalName = addPickName || addName

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 flex flex-col overflow-hidden"
        style={{ maxHeight:'min(80dvh,80vh)' }}
        onOpenAutoFocus={e => e.preventDefault()}>
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#FF3B30] text-[15px]">취소</button>
            <SheetTitle className="text-[16px] font-bold">공정 추가</SheetTitle>
            <button onClick={() => onAdd(finalName)}
              disabled={!finalName.trim()}
              className="text-[#007AFF] text-[15px] font-semibold disabled:opacity-30">추가</button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-[12px] text-[#8E8E93] text-center">{insertAfterLabel}</p>

          {/* 기존 공정 선택 */}
          <div>
            <label className={labelCls}>기존 공정에서 선택</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PROCESS_NAMES.map(name => {
                const sel = addPickName === name
                const color = PROCESS_COLORS[name]
                return (
                  <button key={name} type="button"
                    onClick={() => { setAddPickName(sel ? '' : name); setAddName('') }}
                    className="px-2.5 py-1 rounded-full text-[12px] font-medium transition-all"
                    style={sel
                      ? { backgroundColor: color, color: '#fff' }
                      : { backgroundColor: `${color}18`, color }
                    }>
                    {name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 직접 입력 */}
          <div>
            <label className={labelCls}>또는 직접 입력</label>
            <input
              value={addName}
              onChange={e => { setAddName(e.target.value); setAddPickName('') }}
              placeholder="공정명 입력"
              className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
            />
          </div>

          {/* 미리보기 */}
          {finalName.trim() && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F0F7FF] border border-[#007AFF]/15">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROCESS_COLORS[finalName] ?? '#007AFF' }} />
              <span className="text-[14px] font-semibold text-black">{finalName}</span>
              <span className="text-[11px] text-[#8E8E93] ml-auto">추가될 공정</span>
            </div>
          )}

          <div className="h-4" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   STEP 3 — 미리보기 + 등록
══════════════════════════════════════════════ */
function Step3Preview({ results, projName, startDate, isEditMode, existingIds, isRegistering, onBack, onRegister }: {
  results: ScheduleResult[]
  projName: string
  startDate: string
  isEditMode: boolean
  existingIds: string[]
  isRegistering: boolean
  onBack: () => void
  onRegister: () => void
}) {
  if (results.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="text-5xl">📋</span>
        <p className="text-[16px] font-semibold">생성된 스케줄이 없습니다</p>
        <button onClick={onBack} className="text-[#007AFF] text-[14px]">← 공정 편집으로</button>
      </div>
    )
  }

  const lastDate = results.reduce((max, r) => r.end_date > max ? r.end_date : max, '')
  const totalDays = Math.ceil(
    (fromYMD(lastDate).getTime() - fromYMD(startDate).getTime()) / (1000*60*60*24)
  ) + 1

  // 간트차트용 날짜 범위 (사전공정 포함해서 가장 이른 날짜부터)
  const earliestDate = results.reduce((min, r) => r.start_date < min ? r.start_date : min, startDate)
  const sd = fromYMD(earliestDate)
  const ed = fromYMD(lastDate)
  const dates: Date[] = []
  let cur = new Date(sd)
  while (cur <= ed) { dates.push(new Date(cur)); cur = addDays(cur, 1) }

  // 행별 그룹핑
  const maxRow = Math.max(...results.map(r => r.row_index))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 서브헤더 */}
      <div className="bg-white px-4 py-2.5 border-b border-black/5 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-[#007AFF] text-[14px]">
          <ChevronLeft className="w-4 h-4" />수정
        </button>
        <div className="text-center">
          <p className="text-[13px] font-semibold text-black">{projName}</p>
          <p className="text-[11px] text-[#8E8E93]">{startDate} ~ {lastDate} ({totalDays}일)</p>
        </div>
        <div className="w-12" />
      </div>

      {/* 요약 카드 */}
      <div className="px-4 pt-3 pb-2 flex gap-2 flex-shrink-0">
        <div className="flex-1 bg-white rounded-2xl border border-black/5 px-3 py-2 text-center">
          <p className="text-[20px] font-bold text-[#007AFF]">{results.length}</p>
          <p className="text-[10px] text-[#8E8E93]">공정 수</p>
        </div>
        <div className="flex-1 bg-white rounded-2xl border border-black/5 px-3 py-2 text-center">
          <p className="text-[20px] font-bold text-[#34C759]">{totalDays}</p>
          <p className="text-[10px] text-[#8E8E93]">총 일수</p>
        </div>
        <div className="flex-1 bg-white rounded-2xl border border-black/5 px-3 py-2 text-center">
          <p className="text-[20px] font-bold text-[#FF9500]">{lastDate.slice(5)}</p>
          <p className="text-[10px] text-[#8E8E93]">예상 완료</p>
        </div>
      </div>

      {/* 간트차트 */}
      <div className="flex-1 overflow-auto mx-4 mb-3 rounded-2xl border border-black/8 bg-white">
        <GanttChart results={results} dates={dates} startDate={startDate} />
      </div>

      {/* 공정 목록 */}
      <div className="px-4 pb-2 flex-shrink-0 max-h-44 overflow-y-auto">
        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className={cn(
              'flex items-center gap-2 py-1.5 px-3 rounded-xl border',
              r.isPreWork ? 'bg-[#FFF9F0] border-[#FF9500]/15' : 'bg-white border-black/5'
            )}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[13px] font-medium text-black flex-1">{r.process}</span>
              <span className="text-[11px] text-[#8E8E93]">{r.start_date.slice(5)} ~ {r.end_date.slice(5)}</span>
              {r.isPreWork && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#FF9500]/15 text-[#FF9500] font-bold flex-shrink-0">
                  철거前
                </span>
              )}
              {!r.isPreWork && r.row_index > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF9500]/10 text-[#FF9500] font-bold flex-shrink-0">
                  {r.row_index+1}행
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 등록/수정 버튼 */}
      <div className="flex-shrink-0 px-4 pb-safe pt-2 border-t border-black/5 bg-white">
        <button onClick={onRegister} disabled={isRegistering}
          className={cn(
            'w-full py-4 text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40',
            isEditMode ? 'bg-[#FF9500]' : 'bg-[#34C759]'
          )}>
          <CheckCircle2 className="w-5 h-5" />
          {isRegistering
            ? (isEditMode ? '수정 중...' : '등록 중...')
            : isEditMode
              ? `기존 삭제 후 ${results.length}개 공정으로 교체`
              : `스케줄러에 ${results.length}개 공정 등록`
          }
        </button>
        {isEditMode && (
          <p className="text-[11px] text-[#FF3B30]/70 text-center mt-1.5">
            ⚠️ 기존 스케줄 {existingIds.length}개가 삭제되고 새로 생성됩니다
          </p>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   간트차트
══════════════════════════════════════════════ */
const DAY_KO = ['일','월','화','수','목','금','토']

function GanttChart({ results, dates, startDate }: {
  results: ScheduleResult[]; dates: Date[]; startDate: string
}) {
  const todayStr = toYMD(new Date())

  // 사전공정(isPreWork)과 본공정 분리
  const preWorkResults = results.filter(r => r.isPreWork)
  const mainResults    = results.filter(r => !r.isPreWork)

  const mainMaxRow = mainResults.length > 0 ? Math.max(...mainResults.map(r => r.row_index)) : 0
  const mainRows   = Array.from({ length: mainMaxRow + 1 }, (_, i) => i)

  // 날짜별 스케줄 맵
  const mainCellMap: Record<string, ScheduleResult> = {}
  mainResults.forEach(r => {
    let cur = fromYMD(r.start_date)
    const end = fromYMD(r.end_date)
    while (cur <= end) { mainCellMap[`${r.row_index}__${toYMD(cur)}`] = r; cur = addDays(cur, 1) }
  })

  // 사전공정 맵 (row0 단일)
  const preCellMap: Record<string, ScheduleResult> = {}
  preWorkResults.forEach(r => {
    let cur = fromYMD(r.start_date)
    const end = fromYMD(r.end_date)
    while (cur <= end) { preCellMap[toYMD(cur)] = r; cur = addDays(cur, 1) }
  })

  const hasPreWork = preWorkResults.length > 0

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse" style={{ tableLayout:'fixed' }}>
        <thead>
          <tr>
            <th className="sticky left-0 bg-[#1C3557] border-b border-r border-white/10 text-white"
              style={{ minWidth:44, width:44 }}>
              <div className="px-1 py-2 text-[9px] font-bold text-center">행</div>
            </th>
            {dates.map(d => {
              const ymd = toYMD(d)
              const isToday = ymd === todayStr
              const isCutLine = ymd === startDate // 철거 시작일 = 기준선
              const sat = d.getDay()===6, sun = d.getDay()===0
              return (
                <th key={ymd}
                  className={cn(
                    'border-b border-r border-black/8 text-center',
                    isCutLine ? 'bg-[#FF3B30]' :
                    isToday ? 'bg-[#007AFF]' : sat ? 'bg-[#EBF4FF]' : sun ? 'bg-[#FFF0F0]' : 'bg-white'
                  )}
                  style={{ minWidth:32, width:32 }}>
                  <div className="py-1 flex flex-col items-center">
                    <span className={cn('text-[8px]',
                      isCutLine ? 'text-white/80' :
                      isToday ? 'text-white/80' : sun ? 'text-[#FF3B30]' : sat ? 'text-[#007AFF]' : 'text-[#8E8E93]'
                    )}>{DAY_KO[d.getDay()]}</span>
                    <span className={cn('text-[11px] font-bold',
                      isCutLine ? 'text-white' :
                      isToday ? 'text-white' : sun ? 'text-[#FF3B30]' : sat ? 'text-[#007AFF]' : 'text-black'
                    )}>{d.getDate()}</span>
                    {d.getDate()===1 && (
                      <span className={cn('text-[7px]', (isToday||isCutLine)?'text-white/70':'text-[#8E8E93]')}>
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
          {/* 사전공정 행 (배경 구분) */}
          {hasPreWork && (
            <tr>
              <td className="sticky left-0 border-r border-b border-black/8 text-center"
                style={{ minWidth:44, width:44, backgroundColor:'#FFF3E0' }}>
                <span className="text-[9px] font-bold text-[#FF9500]">철거前</span>
              </td>
              {dates.map(d => {
                const ymd = toYMD(d)
                const s = preCellMap[ymd]
                const isStart = s && s.start_date === ymd
                const isCutLine = ymd === startDate
                const sat = d.getDay()===6, sun = d.getDay()===0
                return (
                  <td key={ymd}
                    className={cn('border-b border-r border-black/5 p-0')}
                    style={{
                      minWidth:32, width:32, height:26,
                      backgroundColor: isCutLine ? '#FF3B3022' :
                        !s ? (sat||sun ? '#FFF3E0' : '#FFFBF5') : undefined,
                      borderLeft: isCutLine ? '2px solid #FF3B30' : undefined,
                    }}>
                    {s && (
                      <div className="h-full flex items-center px-0.5"
                        style={{
                          backgroundColor: isStart ? `${s.color}CC` : `${s.color}55`,
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
          )}

          {/* 본공정 행들 */}
          {mainRows.map(rowIdx => (
            <tr key={rowIdx}>
              <td className="sticky left-0 bg-[#F8F9FA] border-r border-b border-black/8 text-center"
                style={{ minWidth:44, width:44 }}>
                <span className="text-[10px] font-bold text-[#8E8E93]">{rowIdx+1}행</span>
              </td>
              {dates.map(d => {
                const ymd = toYMD(d)
                const s = mainCellMap[`${rowIdx}__${ymd}`]
                const isStart = s && s.start_date === ymd
                const isToday = ymd === todayStr
                const isCutLine = ymd === startDate
                const sat = d.getDay()===6, sun = d.getDay()===0
                return (
                  <td key={ymd}
                    className={cn('border-b border-r border-black/5 p-0')}
                    style={{
                      minWidth:32, width:32, height:28,
                      backgroundColor: isCutLine && !s ? '#FF3B3010' :
                        !s ? (isToday ? '#007AFF0D' : sat ? '#EBF4FF80' : sun ? '#FFF0F080' : undefined) : undefined,
                      borderLeft: isCutLine && !s ? '2px solid #FF3B3040' : undefined,
                    }}>
                    {s && (
                      <div className="h-full flex items-center px-0.5"
                        style={{
                          backgroundColor: isStart ? `${s.color}CC` : `${s.color}55`,
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
        </tbody>
      </table>
    </div>
  )
}
