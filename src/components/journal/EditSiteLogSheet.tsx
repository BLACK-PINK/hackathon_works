'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhotoUploader } from './PhotoUploader'

interface EditSiteLogSheetProps {
  open: boolean
  log: any | null          // 수정할 현장일지 (null이면 닫힘)
  onClose: () => void
  onSuccess: () => void
  profile: any
}

const WEATHER_OPTIONS = ['☀️ 맑음', '⛅ 흐림', '🌧️ 비', '❄️ 눈', '💨 바람']

export function EditSiteLogSheet({ open, log, onClose, onSuccess, profile }: EditSiteLogSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [projectId, setProjectId] = useState('')
  const [weather, setWeather] = useState('')
  const [process, setProcess] = useState('')
  const [workContent, setWorkContent] = useState('')
  const [workersCount, setWorkersCount] = useState('')
  const [workerNames, setWorkerNames] = useState('')
  const [specialNotes, setSpecialNotes] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  // log 바뀔 때마다 폼 초기화
  useEffect(() => {
    if (log) {
      setProjectId(log.project_id ?? '')
      setWeather(log.weather ?? '')
      setProcess(log.process ?? '')
      setWorkContent(log.work_content ?? '')
      setWorkersCount(log.workers_count ? String(log.workers_count) : '')
      setWorkerNames(log.worker_names ?? '')
      setSpecialNotes(log.special_notes ?? '')
      setPhotoUrls(Array.isArray(log.photo_urls) ? log.photo_urls : [])
    }
  }, [log])

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

  // ── 수정 저장
  const editLog = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('현장을 선택해주세요')
      if (!workContent.trim()) throw new Error('작업 내용을 입력해주세요')

      const basePayload = {
        project_id: projectId,
        weather: weather || null,
        process: process.trim() || null,
        work_content: workContent.trim(),
        workers_count: workersCount ? parseInt(workersCount) : 0,
        worker_names: workerNames.trim() || null,
        special_notes: specialNotes.trim() || null,
      }

      // photo_urls 컬럼이 DB에 없을 수 있으므로 먼저 사진 포함 시도,
      // 컬럼 오류 발생 시 사진 제외하고 재시도
      const { error } = await supabase
        .from('site_logs')
        .update({ ...basePayload, photo_urls: photoUrls.length > 0 ? photoUrls : null })
        .eq('id', log?.id)

      if (error) {
        // schema cache 오류: photo_urls 컬럼 미생성 → 사진 제외 재시도
        if (error.message?.includes('photo_urls') || error.code === 'PGRST204') {
          console.warn('[EditSiteLogSheet] photo_urls 컬럼 없음, 제외 후 재저장')
          const { error: err2 } = await supabase
            .from('site_logs')
            .update(basePayload)
            .eq('id', log?.id)
          if (err2) throw err2
          // 저장은 성공했지만 사진은 미저장임을 알림
          if (photoUrls.length > 0) {
            toast.warning('저장 완료 (사진 저장 불가 — Supabase DB 마이그레이션 필요)')
            return
          }
        } else {
          throw error
        }
      }
    },
    onSuccess: () => {
      toast.success('현장일지가 수정되었습니다')
      // site-logs 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['site-logs'] })
      onSuccess()
      onClose()
    },
    onError: (e: any) => {
      toast.error(e.message || '수정에 실패했습니다')
      console.error('[EditSiteLogSheet]', e)
    },
  })

  const handleSubmit = () => {
    if (!projectId) { toast.error('현장을 선택해주세요'); return }
    if (!workContent.trim()) { toast.error('작업 내용을 입력해주세요'); return }
    editLog.mutate()
  }

  const selectedProject = projects.find((p: any) => p.id === projectId)

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
              disabled={editLog.isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {editLog.isPending ? '저장중...' : '저장'}
            </button>
          </div>
        </SheetHeader>

        {/* ── 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">

            {/* 현장 선택 */}
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

            {/* 날씨 */}
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

            {/* 공정 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                공정 (선택)
              </label>
              <input
                type="text"
                value={process}
                onChange={(e) => setProcess(e.target.value)}
                placeholder="예: 바닥공사, 도배, 전기배선"
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
              />
            </div>

            {/* 작업 내용 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                작업 내용 *
              </label>
              <textarea
                value={workContent}
                onChange={(e) => setWorkContent(e.target.value)}
                placeholder="진행한 작업 내용을 입력하세요"
                rows={4}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
              />
            </div>

            {/* 투입 인원 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                투입 인원
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={workersCount}
                  onChange={(e) => setWorkersCount(e.target.value)}
                  placeholder="0명"
                  min="0"
                  className="w-20 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none text-center"
                />
                <input
                  type="text"
                  value={workerNames}
                  onChange={(e) => setWorkerNames(e.target.value)}
                  placeholder="홍길동, 김철수"
                  className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none"
                />
              </div>
            </div>

            {/* 특이사항 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                특이사항 (선택)
              </label>
              <textarea
                value={specialNotes}
                onChange={(e) => setSpecialNotes(e.target.value)}
                placeholder="안전 주의, 지연 사유 등"
                rows={2}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none"
              />
            </div>

            {/* 현장 사진 */}
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
