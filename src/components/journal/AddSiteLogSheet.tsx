'use client'

import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhotoUploader } from './PhotoUploader'

interface AddSiteLogSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  date: string
  profile: any
}

// 작업 항목 1개
interface WorkItem {
  id: number
  process: string
  workContent: string
  workersCount: string
  workerNames: string
  specialNotes: string
}

let nextId = 1
const newItem = (): WorkItem => ({
  id: nextId++,
  process: '',
  workContent: '',
  workersCount: '',
  workerNames: '',
  specialNotes: '',
})

const WEATHER_OPTIONS = ['☀️ 맑음', '⛅ 흐림', '🌧️ 비', '❄️ 눈', '💨 바람']

export function AddSiteLogSheet({ open, onClose, onSuccess, date, profile }: AddSiteLogSheetProps) {
  const supabase = createClient()

  // ── 공통 필드
  const [projectId, setProjectId] = useState('')
  const [weather, setWeather] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])   // 현장 공통 사진

  // ── 다중 작업 항목
  const [items, setItems] = useState<WorkItem[]>([newItem()])
  const [expandedId, setExpandedId] = useState<number | null>(items[0].id)

  // + 항목 추가 버튼 ref (추가 후 스크롤 기준점)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  // 프로젝트 목록
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

  // ── 항목 유틸
  const updateItem = (id: number, patch: Partial<WorkItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const addItem = useCallback(() => {
    const item = newItem()
    setItems(prev => [...prev, item])
    setExpandedId(item.id)
    // 새 항목 렌더 후 + 버튼이 화면에 보이도록 스크롤
    setTimeout(() => {
      addBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }, [])

  const removeItem = (id: number) => {
    if (items.length === 1) return
    setItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (expandedId === id) setExpandedId(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  // ── 저장
  const addLog = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('현장을 선택해주세요')
      const filled = items.filter(i => i.workContent.trim())
      if (filled.length === 0) throw new Error('작업 내용을 입력해주세요')

      const baseRows = filled.map(item => ({
        company_id: profile.company_id,
        project_id: projectId,
        date,
        process: item.process.trim() || null,
        work_content: item.workContent.trim(),
        workers_count: item.workersCount ? parseInt(item.workersCount) : 0,
        worker_names: item.workerNames.trim() || null,
        special_notes: item.specialNotes.trim() || null,
        weather: weather || null,
        created_by: profile.id,
      }))

      // photo_urls 먼저 시도, 컬럼 없으면 사진 제외 재시도
      const rowsWithPhoto = baseRows.map(r => ({
        ...r,
        photo_urls: photoUrls.length > 0 ? photoUrls : null,
      }))

      const { error } = await supabase.from('site_logs').insert(rowsWithPhoto)

      if (error) {
        if (error.message?.includes('photo_urls') || error.code === 'PGRST204') {
          console.warn('[AddSiteLogSheet] photo_urls 컬럼 없음, 제외 후 재저장')
          const { error: err2 } = await supabase.from('site_logs').insert(baseRows)
          if (err2) throw err2
          if (photoUrls.length > 0) {
            toast.warning('저장 완료 (사진 저장 불가 — Supabase DB 마이그레이션 필요)')
          }
        } else {
          throw error
        }
      }
    },
    onSuccess: () => {
      const count = items.filter(i => i.workContent.trim()).length
      toast.success(`현장일지 ${count}개 항목이 저장되었습니다`)
      handleClose()
      onSuccess()
    },
    onError: (e: any) => {
      toast.error(e.message || '작성에 실패했습니다')
      console.error('[AddSiteLogSheet]', e)
    },
  })

  const handleClose = () => {
    const first = newItem()
    setItems([first])
    setExpandedId(first.id)
    setProjectId('')
    setWeather('')
    setPhotoUrls([])
    onClose()
  }

  const handleSubmit = () => {
    if (!projectId) { toast.error('현장을 선택해주세요'); return }
    if (!items.some(i => i.workContent.trim())) { toast.error('작업 내용을 입력해주세요'); return }
    addLog.mutate()
  }

  const selectedProject = projects.find((p: any) => p.id === projectId)

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 flex flex-col" style={{ maxHeight: '92dvh' }} onOpenAutoFocus={(e) => e.preventDefault()}>

        {/* ── 헤더 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">현장일지 작성</SheetTitle>
            <button
              onClick={handleSubmit}
              disabled={addLog.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {addLog.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* ── 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">

            {/* ━━━ 1. 현장 선택 ━━━ */}
            <div className="ios-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[16px]">🏗️</span>
                <label className="text-[13px] font-semibold text-black">현장 선택 *</label>
              </div>
              <div className="relative">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none"
                >
                  <option value="">현장을 선택하세요</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
              </div>
              {selectedProject && (
                <div className="mt-2">
                  <span className="text-[12px] bg-[#FF9500]/10 text-[#FF9500] px-2.5 py-1 rounded-full font-medium">
                    📍 {selectedProject.name}
                  </span>
                </div>
              )}
            </div>

            {/* ━━━ 2. 날씨 ━━━ */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                날씨
              </label>
              <div className="flex gap-2">
                {WEATHER_OPTIONS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWeather(weather === w ? '' : w)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-[11px] font-medium border-2 transition-all',
                      weather === w
                        ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        : 'border-transparent bg-[#F2F2F7] text-[#3C3C43]'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* ━━━ 3. 작업 항목 카드 목록 ━━━ */}
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-black">
                작업 항목
                <span className="text-[#007AFF] ml-1.5 font-normal text-[11px]">
                  {items.length}개
                </span>
              </label>

              {/* 카드 목록 — 공정 / 작업내용 / 투입인원 / 특이사항 */}
              {items.map((item, idx) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  isExpanded={expandedId === item.id}
                  canRemove={items.length > 1}
                  onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}

              {/* ━━ + 작업 항목 추가 버튼 ━━ */}
              <button
                ref={addBtnRef}
                onClick={addItem}
                className="w-full py-3 border-2 border-dashed border-[#34C759]/40 rounded-xl
                           flex items-center justify-center gap-2
                           text-[#34C759] text-[14px] font-medium
                           active:opacity-60 hover:border-[#34C759]/70 hover:bg-[#34C759]/5
                           transition-all"
              >
                <Plus className="w-4 h-4" />
                작업 항목 추가
              </button>
            </div>

            {/* ━━━ 4. 현장 사진 (공통) ━━━ */}
            <PhotoUploader
              urls={photoUrls}
              onChange={setPhotoUrls}
              companyId={profile.company_id}
            />

            <div className="pb-8" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────
// WorkItemCard
// 펼침 순서: 공정(선택) → 작업내용* → 투입인원(인원수+이름) → 특이사항
// ─────────────────────────────────────────────────────────────
function WorkItemCard({
  item,
  index,
  isExpanded,
  canRemove,
  onToggleExpand,
  onUpdate,
  onRemove,
}: {
  item: WorkItem
  index: number
  isExpanded: boolean
  canRemove: boolean
  onToggleExpand: () => void
  onUpdate: (patch: Partial<WorkItem>) => void
  onRemove: () => void
}) {
  return (
    <div className={cn(
      'ios-card overflow-hidden border-2 transition-colors',
      isExpanded ? 'border-[#34C759]/20' : 'border-transparent'
    )}>

      {/* ── 요약 행 (접힌 상태) */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-6 h-6 rounded-full bg-[#34C759] text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0" onClick={onToggleExpand}>
          <p className="text-[14px] text-black truncate cursor-pointer">
            {item.process || item.workContent
              ? `${item.process ? `[${item.process}] ` : ''}${item.workContent || '작업 내용 입력 중...'}`
              : '공정 / 작업 내용 입력'
            }
          </p>
          {(item.workersCount || item.workerNames) && (
            <p className="text-[11px] text-[#8E8E93] mt-0.5">
              👥 {item.workersCount ? `${item.workersCount}명` : ''}{item.workerNames ? ` · ${item.workerNames}` : ''}
            </p>
          )}
        </div>

        <button onClick={onToggleExpand} className="flex-shrink-0 p-1 text-[#8E8E93] active:opacity-60">
          <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
        </button>

        {canRemove && (
          <button onClick={onRemove} className="flex-shrink-0 p-1 text-[#FF3B30] active:opacity-60">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── 펼침 입력 영역 */}
      {isExpanded && (
        <div className="px-4 pb-5 pt-0 border-t border-black/5 space-y-4 bg-[#FAFAFA]">

          {/* 1) 공정 */}
          <div className="pt-4">
            <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              공정 <span className="font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={item.process}
              onChange={(e) => onUpdate({ process: e.target.value })}
              placeholder="예: 바닥공사, 도배, 전기배선"
              className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none border border-black/8"
            />
          </div>

          {/* 2) 작업 내용 */}
          <div>
            <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              작업 내용 <span className="text-[#FF3B30]">*</span>
            </label>
            <textarea
              value={item.workContent}
              onChange={(e) => onUpdate({ workContent: e.target.value })}
              placeholder="진행한 작업 내용을 입력하세요"
              rows={3}
              className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none resize-none border border-black/8"

            />
          </div>

          {/* 3) 투입 인원 */}
          <div>
            <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              투입 인원
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={item.workersCount}
                onChange={(e) => onUpdate({ workersCount: e.target.value })}
                placeholder="0"
                min="0"
                className="w-20 px-3 py-2.5 bg-white rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none text-center border border-black/8"
              />
              <input
                type="text"
                value={item.workerNames}
                onChange={(e) => onUpdate({ workerNames: e.target.value })}
                placeholder="홍길동, 김철수"
                className="flex-1 px-3 py-2.5 bg-white rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none border border-black/8"
              />
            </div>
          </div>

          {/* 4) 특이사항 */}
          <div>
            <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
              특이사항 <span className="font-normal">(선택)</span>
            </label>
            <textarea
              value={item.specialNotes}
              onChange={(e) => onUpdate({ specialNotes: e.target.value })}
              placeholder="안전 주의, 지연 사유 등"
              rows={2}
              className="w-full px-3 py-2.5 bg-white rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none resize-none border border-black/8"
            />
          </div>

        </div>
      )}
    </div>
  )
}
