'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { Plus, X, ChevronDown, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhotoUploader } from './PhotoUploader'
import type { SiteGroup } from './SiteLogList'

interface EditProjectGroupSheetProps {
  open: boolean
  group: SiteGroup | null
  onClose: () => void
  onSuccess: () => void
  profile: any
}

// 편집 중인 공정 1개
interface EditItem {
  id: string          // 기존 log.id (신규면 'new-xxx')
  process: string
  workContent: string
  workersCount: string
  workerNames: string
  specialNotes: string
  photoUrls: string[]
  isNew: boolean
  toDelete: boolean
}

const WEATHER_OPTIONS = ['☀️ 맑음', '⛅ 흐림', '🌧️ 비', '❄️ 눈', '💨 바람']

let newSeq = 1
const makeNewItem = (): EditItem => ({
  id: `new-${newSeq++}`,
  process: '',
  workContent: '',
  workersCount: '',
  workerNames: '',
  specialNotes: '',
  photoUrls: [],
  isNew: true,
  toDelete: false,
})

export function EditProjectGroupSheet({
  open,
  group,
  onClose,
  onSuccess,
  profile,
}: EditProjectGroupSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [projectId, setProjectId] = useState('')
  const [weather, setWeather] = useState('')
  const [items, setItems] = useState<EditItem[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // group 바뀌면 폼 초기화
  useEffect(() => {
    if (group) {
      setProjectId(group.projectId ?? '')
      setWeather(group.weather ?? '')
      const initial = group.logs.map((log: any): EditItem => ({
        id: log.id,
        process: log.process ?? '',
        workContent: log.work_content ?? '',
        workersCount: log.workers_count ? String(log.workers_count) : '',
        workerNames: log.worker_names ?? '',
        specialNotes: log.special_notes ?? '',
        photoUrls: Array.isArray(log.photo_urls) ? log.photo_urls : [],
        isNew: false,
        toDelete: false,
      }))
      setItems(initial)
      setExpandedId(initial[0]?.id ?? null)
    }
  }, [group])

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

  const updateItem = (id: string, patch: Partial<EditItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const addItem = () => {
    const item = makeNewItem()
    setItems(prev => [...prev, item])
    setExpandedId(item.id)
  }

  const toggleDelete = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, toDelete: !i.toDelete } : i))
  }

  // ── 저장
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('현장을 선택해주세요')

      const visible = items.filter(i => !i.toDelete)
      if (visible.length === 0 || !visible.some(i => i.workContent.trim())) {
        throw new Error('작업 내용을 한 개 이상 입력해주세요')
      }

      // 1. 삭제 처리
      const deleteIds = items.filter(i => i.toDelete && !i.isNew).map(i => i.id)
      if (deleteIds.length > 0) {
        const { error } = await supabase.from('site_logs').delete().in('id', deleteIds)
        if (error) throw error
      }

      // 2. 기존 항목 업데이트
      for (const item of items.filter(i => !i.isNew && !i.toDelete)) {
        const basePayload = {
          project_id: projectId,
          weather: weather || null,
          process: item.process.trim() || null,
          work_content: item.workContent.trim(),
          workers_count: item.workersCount ? parseInt(item.workersCount) : 0,
          worker_names: item.workerNames.trim() || null,
          special_notes: item.specialNotes.trim() || null,
        }

        const { error } = await supabase
          .from('site_logs')
          .update({ ...basePayload, photo_urls: item.photoUrls.length > 0 ? item.photoUrls : null })
          .eq('id', item.id)

        if (error) {
          if (error.message?.includes('photo_urls') || error.code === 'PGRST204') {
            const { error: e2 } = await supabase.from('site_logs').update(basePayload).eq('id', item.id)
            if (e2) throw e2
          } else {
            throw error
          }
        }
      }

      // 3. 신규 항목 insert
      const newItems = items.filter(i => i.isNew && !i.toDelete && i.workContent.trim())
      if (newItems.length > 0) {
        const baseRows = newItems.map(item => ({
          company_id: profile.company_id,
          project_id: projectId,
          date: group!.logs[0]?.date,
          weather: weather || null,
          process: item.process.trim() || null,
          work_content: item.workContent.trim(),
          workers_count: item.workersCount ? parseInt(item.workersCount) : 0,
          worker_names: item.workerNames.trim() || null,
          special_notes: item.specialNotes.trim() || null,
          created_by: profile.id,
        }))

        const rowsWithPhoto = baseRows.map((r, i) => ({
          ...r,
          photo_urls: newItems[i].photoUrls.length > 0 ? newItems[i].photoUrls : null,
        }))

        const { error } = await supabase.from('site_logs').insert(rowsWithPhoto)
        if (error) {
          if (error.message?.includes('photo_urls') || error.code === 'PGRST204') {
            const { error: e2 } = await supabase.from('site_logs').insert(baseRows)
            if (e2) throw e2
          } else {
            throw error
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('현장일지가 수정되었습니다')
      queryClient.invalidateQueries({ queryKey: ['site-logs'] })
      onSuccess()
      onClose()
    },
    onError: (e: any) => {
      toast.error(e.message || '수정에 실패했습니다')
    },
  })

  const handleSubmit = () => {
    const visible = items.filter(i => !i.toDelete)
    if (!projectId) { toast.error('현장을 선택해주세요'); return }
    if (!visible.some(i => i.workContent.trim())) { toast.error('작업 내용을 입력해주세요'); return }
    saveMutation.mutate()
  }

  const selectedProject = projects.find((p: any) => p.id === projectId)
  const visibleItems = items.filter(i => !i.toDelete)
  const deletedItems = items.filter(i => i.toDelete && !i.isNew)

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-0 flex flex-col" style={{ maxHeight: '92dvh' }} onOpenAutoFocus={(e) => e.preventDefault()}>

        {/* ── 헤더 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">현장일지 수정</SheetTitle>
            <button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {saveMutation.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* ── 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">

            {/* 1. 현장 선택 */}
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

            {/* 2. 날씨 */}
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

            {/* 3. 공정 목록 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-semibold text-black">
                  작업 항목
                  <span className="text-[#007AFF] ml-1.5 font-normal text-[11px]">
                    {visibleItems.length}개
                  </span>
                </label>
              </div>

              {visibleItems.map((item, idx) => (
                <EditItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  isExpanded={expandedId === item.id}
                  canDelete={visibleItems.length > 1 || deletedItems.length > 0}
                  companyId={profile.company_id}
                  onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onDelete={() => {
                    if (item.isNew) {
                      setItems(prev => prev.filter(i => i.id !== item.id))
                      setExpandedId(null)
                    } else {
                      toggleDelete(item.id)
                      setExpandedId(null)
                    }
                  }}
                />
              ))}

              {/* 삭제 예정 항목 표시 */}
              {deletedItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[#FF3B30] font-medium px-1">삭제 예정 ({deletedItems.length}개)</p>
                  {deletedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2 bg-[#FF3B30]/5 rounded-xl border border-[#FF3B30]/20">
                      <p className="flex-1 text-[13px] text-[#FF3B30] line-through truncate">
                        {item.process ? `[${item.process}] ` : ''}{item.workContent}
                      </p>
                      <button
                        onClick={() => toggleDelete(item.id)}
                        className="text-[11px] text-[#007AFF] font-medium active:opacity-60 flex-shrink-0"
                      >
                        복원
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* + 항목 추가 */}
              <button
                onClick={addItem}
                className="w-full py-3 border-2 border-dashed border-[#34C759]/40 rounded-xl
                           flex items-center justify-center gap-2
                           text-[#34C759] text-[14px] font-medium
                           active:opacity-60 hover:border-[#34C759]/70 hover:bg-[#34C759]/5 transition-all"
              >
                <Plus className="w-4 h-4" />
                공정 추가
              </button>
            </div>

            <div className="pb-8" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────
// EditItemCard: 공정 1개 편집 카드
// ─────────────────────────────────────────────
function EditItemCard({
  item,
  index,
  isExpanded,
  canDelete,
  companyId,
  onToggleExpand,
  onUpdate,
  onDelete,
}: {
  item: EditItem
  index: number
  isExpanded: boolean
  canDelete: boolean
  companyId: string
  onToggleExpand: () => void
  onUpdate: (patch: Partial<EditItem>) => void
  onDelete: () => void
}) {
  return (
    <div className={cn(
      'ios-card overflow-hidden border-2 transition-colors',
      isExpanded ? 'border-[#007AFF]/20' : 'border-transparent',
      item.isNew ? 'border-[#34C759]/20' : ''
    )}>
      {/* 요약 행 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={cn(
          'w-6 h-6 rounded-full text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0',
          item.isNew ? 'bg-[#34C759]' : 'bg-[#007AFF]'
        )}>
          {item.isNew ? '+' : index + 1}
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

        {canDelete && (
          <button onClick={onDelete} className="flex-shrink-0 p-1 text-[#FF3B30] active:opacity-60">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 펼침 입력 */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-black/5 space-y-3 bg-[#FAFAFA]">

          {/* 공정 */}
          <div className="pt-3">
            <label className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1 block">
              공정 (선택)
            </label>
            <input
              type="text"
              value={item.process}
              onChange={(e) => onUpdate({ process: e.target.value })}
              placeholder="예: 바닥공사, 도배, 전기배선"
              className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none"
            />
          </div>

          {/* 작업 내용 */}
          <div>
            <label className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1 block">
              작업 내용 *
            </label>
            <textarea
              value={item.workContent}
              onChange={(e) => onUpdate({ workContent: e.target.value })}
              placeholder="진행한 작업 내용을 입력하세요"
              rows={3}
              className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
            />
          </div>

          {/* 투입 인원 */}
          <div>
            <label className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1 block">
              투입 인원
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={item.workersCount}
                onChange={(e) => onUpdate({ workersCount: e.target.value })}
                placeholder="0"
                min="0"
                className="w-16 px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none text-center"
              />
              <input
                type="text"
                value={item.workerNames}
                onChange={(e) => onUpdate({ workerNames: e.target.value })}
                placeholder="홍길동, 김철수"
                className="flex-1 px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none"
              />
            </div>
          </div>

          {/* 특이사항 */}
          <div>
            <label className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1 block">
              특이사항 (선택)
            </label>
            <textarea
              value={item.specialNotes}
              onChange={(e) => onUpdate({ specialNotes: e.target.value })}
              placeholder="안전 주의, 지연 사유 등"
              rows={2}
              className="w-full px-3 py-2.5 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
            />
          </div>

          {/* 현장 사진 */}
          <PhotoUploader
            urls={item.photoUrls}
            onChange={(urls) => onUpdate({ photoUrls: urls })}
            companyId={companyId}
            maxCount={5}
          />
        </div>
      )}
    </div>
  )
}
