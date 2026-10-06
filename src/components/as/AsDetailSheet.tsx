'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChevronDown, Pencil, CheckCircle2, RotateCcw, Plus, Minus, Trash2, Camera, X, ImageIcon, CheckSquare, Square } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'

interface AsDetailSheetProps {
  record: any | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
  profile: any
}

type SiteMode = 'select' | 'manual'

function parseVisitDatetime(val: string | null | undefined) {
  if (!val) return { date: '', hour: '', minute: '00' }
  const d = new Date(val)
  if (isNaN(d.getTime())) return { date: '', hour: '', minute: '00' }
  const date = format(d, 'yyyy-MM-dd')
  const h = d.getHours(), m = d.getMinutes()
  const hasTime = !(h === 0 && m === 0)
  const roundedMin = Math.round(m / 5) * 5
  const minute = String(roundedMin === 60 ? 0 : roundedMin).padStart(2, '0')
  return { date, hour: hasTime ? String(h) : '', minute }
}

function formatVisitDisplay(val: string | null | undefined) {
  if (!val) return '-'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  const h = d.getHours(), m = d.getMinutes()
  const hasTime = !(h === 0 && m === 0)
  if (hasTime) return format(d, 'yyyy-MM-dd HH:mm')
  return format(d, 'yyyy-MM-dd')
}

export function AsDetailSheet({ record, open, onClose, onUpdated, profile }: AsDetailSheetProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [showPhotoSourceModal, setShowPhotoSourceModal] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // 편집 폼 상태
  const [receivedDate, setReceivedDate] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [visitHour, setVisitHour] = useState('')
  const [visitMinute, setVisitMinute] = useState('00')
  const [contentItems, setContentItems] = useState<string[]>([''])
  const [resolution, setResolution] = useState('')
  const [handlerName, setHandlerName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [siteMode, setSiteMode] = useState<SiteMode>('select')
  const [siteName, setSiteName] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [assignedTo, setAssignedTo] = useState('')     // AS 담당자 (거래처 ID)
  const [asRequested, setAsRequested] = useState(false) // AS 요청 체크박스

  // 사진 — 요청 사진 (photo_urls)
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([])
  const [newPhotos, setNewPhotos] = useState<File[]>([])
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([])

  // 사진 — 완료 사진 (completion_photo_urls)
  const [existingCmpUrls, setExistingCmpUrls] = useState<string[]>([])
  const [newCmpPhotos, setNewCmpPhotos] = useState<File[]>([])
  const [newCmpPreviews, setNewCmpPreviews] = useState<string[]>([])

  const [uploading, setUploading] = useState(false)

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects-all', profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, status')
        .eq('company_id', profile.company_id).order('name')
      return data || []
    },
    enabled: isEditing,
  })
  const activeProjects = allProjects.filter((p: any) => p.status === 'active')
  const completedProjects = allProjects.filter((p: any) => p.status === 'completed')

  const { data: members = [] } = useQuery({
    queryKey: ['members-list', profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('id, name')
        .eq('company_id', profile.company_id).order('name')
      return data || []
    },
    enabled: isEditing,
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list', profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name, process')
        .eq('company_id', profile.company_id).order('name')
      return data || []
    },
    enabled: isEditing,
  })

  const handleEdit = () => {
    if (!record) return
    const { date, hour, minute } = parseVisitDatetime(record.visit_date)
    setReceivedDate(record.received_date || format(new Date(), 'yyyy-MM-dd'))
    setVisitDate(date); setVisitHour(hour); setVisitMinute(minute)
    const raw = record.content || ''
    const lines = raw.split('\n').map((l: string) => l.replace(/^\d+\.\s*/, '').trim()).filter((l: string) => l)
    setContentItems(lines.length > 0 ? lines : [''])
    setResolution(record.resolution || '')
    setHandlerName(record.handler_name || '')

    // 현장 모드 결정
    if (record.site_name) {
      setSiteMode('manual'); setSiteName(record.site_name); setProjectId('')
    } else {
      setSiteMode('select'); setProjectId(record.project_id || ''); setSiteName('')
    }

    setClientName(record.client_name || '')
    setClientPhone(record.client_phone || '')
    setAssignedTo(record.vendor_assigned_to || '')
    setAsRequested(record.as_requested || false)
    setExistingPhotoUrls(record.photo_urls || [])
    setNewPhotos([]); setNewPhotoPreviews([])
    setExistingCmpUrls(record.completion_photo_urls || [])
    setNewCmpPhotos([]); setNewCmpPreviews([])
    setIsEditing(true)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 50)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 200)
  }

  const buildVisitDatetime = () => {
    if (!visitDate) return null
    if (visitHour) return `${visitDate}T${visitHour.padStart(2, '0')}:${visitMinute}:00`
    return `${visitDate}T00:00:00`
  }

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i))
  const minuteOptions = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

  // ── 새 사진 선택
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const total = existingPhotoUrls.length + newPhotos.length
    const remaining = 5 - total
    const toAdd = files.slice(0, remaining)
    if (toAdd.length < files.length) toast.warning('최대 5장까지 첨부 가능합니다')
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => setNewPhotoPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
    setNewPhotos(prev => [...prev, ...toAdd])
    e.target.value = ''
  }

  const removeExistingPhoto = (idx: number) => setExistingPhotoUrls(prev => prev.filter((_, i) => i !== idx))
  const removeNewPhoto = (idx: number) => {
    setNewPhotos(prev => prev.filter((_, i) => i !== idx))
    setNewPhotoPreviews(prev => prev.filter((_, i) => i !== idx))
  }
  const removeExistingCmp = (idx: number) => setExistingCmpUrls(prev => prev.filter((_, i) => i !== idx))
  const removeNewCmp = (idx: number) => {
    setNewCmpPhotos(prev => prev.filter((_, i) => i !== idx))
    setNewCmpPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  // ── 완료 사진 선택 (별도 input)
  const cmpFileInputRef   = useRef<HTMLInputElement>(null)
  const cmpCameraInputRef = useRef<HTMLInputElement>(null)
  const [showCmpPhotoModal, setShowCmpPhotoModal] = useState(false)

  const handleCmpPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const total = existingCmpUrls.length + newCmpPhotos.length
    const remaining = 5 - total
    const toAdd = files.slice(0, remaining)
    if (toAdd.length < files.length) toast.warning('최대 5장까지 첨부 가능합니다')
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => setNewCmpPreviews(p => [...p, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
    setNewCmpPhotos(p => [...p, ...toAdd])
    e.target.value = ''
  }

  // ── 새 사진 업로드
  const uploadPhotosToFolder = async (files: File[], folder: string): Promise<string[]> => {
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${folder}/${profile.company_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('as-photos').upload(path, file, { upsert: false })
      if (error) { console.error('[photo upload]', error); continue }
      const { data: urlData } = supabase.storage.from('as-photos').getPublicUrl(path)
      if (urlData?.publicUrl) urls.push(urlData.publicUrl)
    }
    return urls
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setNewPhotos([]); setNewPhotoPreviews([])
    setNewCmpPhotos([]); setNewCmpPreviews([])
  }

  const addItem = () => setContentItems(prev => [...prev, ''])
  const removeItem = (idx: number) => { if (contentItems.length <= 1) return; setContentItems(prev => prev.filter((_, i) => i !== idx)) }
  const updateItem = (idx: number, val: string) => setContentItems(prev => prev.map((s, i) => i === idx ? val : s))

  const updateMutation = useMutation({
    mutationFn: async () => {
      setUploading(true)
      const [uploadedReq, uploadedCmp] = await Promise.all([
        uploadPhotosToFolder(newPhotos, 'as-request'),
        uploadPhotosToFolder(newCmpPhotos, 'as-completion'),
      ])
      setUploading(false)
      const allPhotoUrls = [...existingPhotoUrls, ...uploadedReq]
      const allCmpUrls   = [...existingCmpUrls,   ...uploadedCmp]

      const filledItems = contentItems.filter(s => s.trim())
      const combinedContent = filledItems.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n')

      // 기본 필드 (기존 컬럼)
      const basePayload: Record<string, any> = {
        received_date: receivedDate,
        visit_date: buildVisitDatetime(),
        content: combinedContent,
        resolution: resolution.trim() || null,
        handler_name: handlerName.trim() || null,
        project_id: siteMode === 'select' ? (projectId || null) : null,
        site_name: siteMode === 'manual' ? (siteName.trim() || null) : null,
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        vendor_assigned_to: assignedTo || null,
        photo_urls: allPhotoUrls.length > 0 ? allPhotoUrls : null,
      }

      // 신규 컬럼 — Supabase SQL 실행 후 활성화됨
      // (컬럼 없으면 에러 발생하므로 별도 try/catch로 처리)
      const { error: baseError } = await supabase
        .from('as_records')
        .update(basePayload)
        .eq('id', record.id)
      if (baseError) throw baseError

      // 신규 컬럼 업데이트 (실패해도 기본 저장은 유지)
      try {
        await supabase.from('as_records').update({
          as_requested: asRequested,
          completion_photo_urls: allCmpUrls.length > 0 ? allCmpUrls : null,
        }).eq('id', record.id)
      } catch (newColErr) {
        console.warn('[AS update] 신규 컬럼 미적용 — Supabase SQL 실행 필요:', newColErr)
      }
    },
    onSuccess: () => {
      toast.success('수정되었습니다')
      setIsEditing(false); setUploading(false)
      queryClient.invalidateQueries({ queryKey: ['as-records-page'] })
      onUpdated()
    },
    onError: (e: any) => { setUploading(false); console.error('[AS update error]', e); toast.error(`수정 실패: ${e?.message || JSON.stringify(e)}`) },
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('as_records').update({
        status: 'completed', completed_date: new Date().toISOString().slice(0, 10),
      }).eq('id', record.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('A/S가 완료 처리되었습니다')
      queryClient.invalidateQueries({ queryKey: ['as-records-page'] })
      onUpdated(); onClose()
    },
    onError: () => toast.error('완료 처리에 실패했습니다'),
  })

  const revertMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('as_records').update({ status: 'received', completed_date: null }).eq('id', record.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('완료가 취소되었습니다')
      queryClient.invalidateQueries({ queryKey: ['as-records-page'] })
      onUpdated(); onClose()
    },
    onError: () => toast.error('처리에 실패했습니다'),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('as_records').delete().eq('id', record.id).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('삭제 권한이 없거나 데이터를 찾을 수 없습니다')
    },
    onSuccess: () => { toast.success('A/S가 삭제되었습니다'); onClose(); onUpdated() },
    onError: (e: any) => toast.error(e?.message || '삭제에 실패했습니다'),
  })

  if (!record) return null
  const isDone = record?.status === 'completed' || record?.status === 'cancelled'
  const isPending = updateMutation.isPending || uploading
  const displaySiteName = record.site_name || record.project?.name || null
  const totalPhotoCount    = existingPhotoUrls.length + newPhotos.length
  const totalCmpPhotoCount = existingCmpUrls.length   + newCmpPhotos.length
  const vendorName = vendors.find((v: any) => v.id === record.vendor_assigned_to)?.name || record.vendor_assigned_to || null

  return (
    <>
      {/* ── 파일 input 4개: Sheet 바깥(Fragment 최상단)에 배치해야 iOS에서 정상 동작 ── */}
      <input id="req-photo-gallery" ref={fileInputRef} type="file" accept="image/*" multiple
        onChange={handlePhotoSelect} className="hidden" />
      <input id="req-photo-camera" ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={handlePhotoSelect} className="hidden" />
      <input id="cmp-photo-gallery" ref={cmpFileInputRef} type="file" accept="image/*" multiple
        onChange={handleCmpPhotoSelect} className="hidden" />
      <input id="cmp-photo-camera" ref={cmpCameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleCmpPhotoSelect} className="hidden" />

      <Sheet open={open} onOpenChange={(v) => { if (!v) { setIsEditing(false); setShowDeleteConfirm(false); setNewPhotos([]); setNewPhotoPreviews([]); onClose() } }}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0 flex flex-col"
          style={{ height: '92dvh', maxHeight: '92dvh' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* 헤더 */}
          <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
            <div className="flex items-center justify-between">
              {isEditing
                ? <button onClick={handleCancelEdit} className="text-[#FF3B30] text-[16px]">취소</button>
                : <button onClick={onClose} className="text-[#007AFF] text-[16px]">닫기</button>
              }
              <SheetTitle className="text-[17px] font-semibold">{isEditing ? 'A/S 수정' : 'A/S 상세'}</SheetTitle>
              {isEditing ? (
                <button onClick={() => updateMutation.mutate()} disabled={isPending}
                  className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40">
                  {uploading ? '업로드중...' : updateMutation.isPending ? '저장중...' : '저장'}
                </button>
              ) : (
                <button onClick={handleEdit} className="flex items-center gap-1 text-[#007AFF] text-[15px]">
                  <Pencil className="w-4 h-4" /> 수정
                </button>
              )}
            </div>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' as any }}>
            {isEditing ? (
              /* ── 수정 모드 ── */
              <div className="px-5 py-4 space-y-5">

                {/* 접수일 */}
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">접수일</label>
                  <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
                    className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none" />
                </div>

                {/* 방문 예정일 + 시간 */}
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                    방문 예정일 <span className="text-[11px] normal-case tracking-normal">(선택)</span>
                  </label>
                  <input type="date" value={visitDate}
                    onChange={(e) => { setVisitDate(e.target.value); if (!e.target.value) { setVisitHour(''); setVisitMinute('00') } }}
                    className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none mb-2" />
                  <div className={`grid grid-cols-2 gap-2 transition-opacity ${!visitDate ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="relative">
                      <select value={visitHour} onChange={(e) => setVisitHour(e.target.value)} disabled={!visitDate}
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none appearance-none">
                        <option value="">시간 미설정</option>
                        {hourOptions.map(h => <option key={h} value={h}>{h}시</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select value={visitMinute} onChange={(e) => setVisitMinute(e.target.value)} disabled={!visitDate || !visitHour}
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none appearance-none disabled:opacity-40">
                        {minuteOptions.map(m => <option key={m} value={m}>{m}분</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                    </div>
                  </div>
                  {visitDate && visitHour && (
                    <p className="text-[12px] text-[#007AFF] mt-1.5 px-1">📅 {visitDate} {visitHour}:{visitMinute}</p>
                  )}
                </div>

                {/* 현장 — 탭 선택 */}
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장</label>
                  <div className="flex bg-[#F2F2F7] rounded-xl p-1 mb-2.5 gap-1">
                    <button onClick={() => setSiteMode('select')}
                      className={cn('flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                        siteMode === 'select' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#8E8E93]')}>
                      목록에서 선택
                    </button>
                    <button onClick={() => setSiteMode('manual')}
                      className={cn('flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                        siteMode === 'manual' ? 'bg-white text-[#FF9500] shadow-sm' : 'text-[#8E8E93]')}>
                      직접 입력
                    </button>
                  </div>
                  {siteMode === 'select' ? (
                    <div className="relative">
                      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                        className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] outline-none appearance-none">
                        <option value="">현장 선택 (선택)</option>
                        {activeProjects.length > 0 && (
                          <optgroup label="── 진행중 현장">
                            {activeProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </optgroup>
                        )}
                        {completedProjects.length > 0 && (
                          <optgroup label="── 완료된 현장">
                            {completedProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                    </div>
                  ) : (
                    <input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)}
                      placeholder="현장명 직접 입력 (예: 강남구 논현동 ○○아파트)"
                      className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] placeholder:text-[#C7C7CC] outline-none" />
                  )}
                </div>

                {/* A/S 내용 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">A/S 내용 *</label>
                    <span className="text-[11px] text-[#8E8E93]">{contentItems.filter(s => s.trim()).length}건 입력됨</span>
                  </div>
                  <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                    {contentItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 px-3 py-2.5 border-b border-black/5 last:border-b-0">
                        <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#007AFF]/15 text-[#007AFF] text-[11px] font-bold flex items-center justify-center">{idx + 1}</span>
                        <input type="text" value={item} onChange={(e) => updateItem(idx, e.target.value)}
                          placeholder={`항목 ${idx + 1} 입력`}
                          className="flex-1 bg-transparent text-[15px] text-black placeholder:text-[#C7C7CC] outline-none min-w-0" />
                        {contentItems.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)}
                            className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] flex items-center justify-center active:opacity-60">
                            <Minus className="w-3 h-3" strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={addItem}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[#007AFF] text-[14px] font-medium active:opacity-60 border-t border-black/5">
                      <Plus className="w-4 h-4" strokeWidth={2.5} />항목 추가
                    </button>
                  </div>
                </div>

                {/* 사진 관리 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">사진</label>
                    <span className="text-[11px] text-[#8E8E93]">{totalPhotoCount}/5</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* 기존 사진 */}
                    {existingPhotoUrls.map((url, idx) => (
                      <div key={`ex-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-black/10">
                        <img src={url} alt="" className="w-full h-full object-cover" onClick={() => setLightboxSrc(url)} />
                        <button type="button" onClick={() => removeExistingPhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {/* 새 사진 미리보기 */}
                    {newPhotoPreviews.map((src, idx) => (
                      <div key={`new-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#007AFF]/30">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeNewPhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-[#007AFF]/80 py-0.5">
                          <p className="text-[9px] text-white text-center">추가됨</p>
                        </div>
                      </div>
                    ))}
                  {/* 추가 버튼 */}
                  {totalPhotoCount < 5 && (
                    <button type="button" onClick={() => setShowPhotoSourceModal(true)}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C7C7CC] flex flex-col items-center justify-center gap-1 active:opacity-60 bg-[#F2F2F7]">
                      <Camera className="w-5 h-5 text-[#8E8E93]" />
                      <span className="text-[10px] text-[#8E8E93]">사진 추가</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#C7C7CC] mt-1.5">최대 5장 · 기존 사진 유지 + 추가 가능</p>
                </div>

                {/* 처리 내용 */}
                <div>
                  <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">처리 내용</label>
                  <textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
                    placeholder="처리한 내용을 입력하세요" rows={3}
                    className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] outline-none resize-none" />
                </div>

                {/* 접수자 + AS 담당자(거래처) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">접수자</label>
                    <div className="relative">
                      <select value={handlerName} onChange={(e) => setHandlerName(e.target.value)}
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none appearance-none">
                        <option value="">선택</option>
                        {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">AS 담당자</label>
                    <div className="relative">
                      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                        className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none appearance-none">
                        <option value="">거래처 선택</option>
                        {vendors.map((v: any) => (
                          <option key={v.id} value={v.id}>{v.name}{v.process ? ` (${v.process})` : ''}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 고객명 + 연락처 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">고객명</label>
                    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                      placeholder="고객 이름"
                      className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none" />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">연락처</label>
                    <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                      placeholder="010-0000-0000"
                      className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] outline-none" />
                  </div>
                </div>

                {/* AS 요청 체크박스 */}
                <button type="button" onClick={() => setAsRequested(v => !v)}
                  className="flex items-center gap-2 active:opacity-60">
                  {asRequested
                    ? <CheckSquare className="w-5 h-5 text-[#007AFF]" />
                    : <Square className="w-5 h-5 text-[#C7C7CC]" />
                  }
                  <span className={cn('text-[14px] font-medium', asRequested ? 'text-[#007AFF]' : 'text-[#8E8E93]')}>
                    AS 요청 완료 (거래처에 전달함)
                  </span>
                </button>

                {/* 완료 사진 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">A/S 완료 사진</label>
                    <span className="text-[11px] text-[#8E8E93]">{totalCmpPhotoCount}/5</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {existingCmpUrls.map((url, idx) => (
                      <div key={`ecmp-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-black/10">
                        <img src={url} alt="" className="w-full h-full object-cover" onClick={() => setLightboxSrc(url)} />
                        <button type="button" onClick={() => removeExistingCmp(idx)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {newCmpPreviews.map((src, idx) => (
                      <div key={`ncmp-${idx}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#34C759]/30">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeNewCmp(idx)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-[#34C759]/80 py-0.5">
                          <p className="text-[9px] text-white text-center">추가됨</p>
                        </div>
                      </div>
                    ))}
                    {totalCmpPhotoCount < 5 && (
                      <button type="button" onClick={() => setShowCmpPhotoModal(true)}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C7C7CC] flex flex-col items-center justify-center gap-1 active:opacity-60 bg-[#F2F2F7]">
                        <Camera className="w-5 h-5 text-[#8E8E93]" />
                        <span className="text-[10px] text-[#8E8E93]">사진 추가</span>
                      </button>
                    )}
                  </div>

                </div>

                <div className="pb-10" />
              </div>
            ) : (
              /* ── 상세 보기 모드 ── */
              <div className="px-5 py-4 space-y-0">

                {/* 상태 + 현장 뱃지 */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className={cn('px-3 py-1 rounded-full text-[12px] font-semibold',
                    isDone ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-[#FF9500]/15 text-[#FF9500]')}>
                    {isDone ? '완료' : '처리중'}
                  </span>
                  {displaySiteName && (
                    <span className={cn('px-3 py-1 rounded-full text-[12px]',
                      record.site_name ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#007AFF]/10 text-[#007AFF]')}>
                      {displaySiteName}
                      {record.site_name && <span className="ml-1 text-[10px] opacity-70">(직접입력)</span>}
                    </span>
                  )}
                </div>

                <DetailRow label="A/S 내용">
                  <p className="text-[15px] text-black leading-relaxed whitespace-pre-wrap">{record.content}</p>
                </DetailRow>

                <DetailRow label="처리 내용">
                  {record.resolution
                    ? <p className="text-[15px] text-black leading-relaxed whitespace-pre-wrap">{record.resolution}</p>
                    : <p className="text-[15px] text-[#C7C7CC]">미입력</p>
                  }
                </DetailRow>

                {record.handler_name && (
                  <DetailRow label="접수자">
                    <p className="text-[15px] text-black">
                      {members.find((m: any) => m.id === record.handler_name)?.name || record.handler_name}
                    </p>
                  </DetailRow>
                )}

                {vendorName && (
                  <DetailRow label="AS 담당자 (거래처)">
                    <p className="text-[15px] text-black">{vendorName}</p>
                  </DetailRow>
                )}

                {record.as_requested && (
                  <DetailRow label="AS 요청">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#007AFF]/10 text-[#007AFF] rounded-full text-[13px] font-medium">
                      ✅ 거래처 전달 완료
                    </span>
                  </DetailRow>
                )}

                <div className="grid grid-cols-2 gap-0">
                  <DetailRow label="접수일">
                    <p className="text-[15px] text-black">{record.received_date}</p>
                  </DetailRow>
                  <DetailRow label="방문 예정일">
                    <p className="text-[15px] text-black">{formatVisitDisplay(record.visit_date)}</p>
                  </DetailRow>
                </div>

                {record.completed_date && (
                  <DetailRow label="완료일">
                    <p className="text-[15px] text-[#34C759]">{record.completed_date}</p>
                  </DetailRow>
                )}

                {(record.client_name || record.client_phone) && (
                  <DetailRow label="고객 정보">
                    <p className="text-[15px] text-black">
                      {record.client_name}{record.client_name && record.client_phone && ' · '}{record.client_phone}
                    </p>
                  </DetailRow>
                )}

                {/* 요청 사진 갤러리 */}
                {record.photo_urls && record.photo_urls.length > 0 && (
                  <DetailRow label={`A/S 요청 사진 (${record.photo_urls.length}장)`}>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {record.photo_urls.map((url: string, idx: number) => (
                        <button key={idx} type="button" onClick={() => setLightboxSrc(url)}
                          className="w-20 h-20 rounded-xl overflow-hidden border border-black/10 active:opacity-80">
                          <img src={url} alt={`사진 ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </DetailRow>
                )}

                {/* 완료 사진 갤러리 */}
                {record.completion_photo_urls && record.completion_photo_urls.length > 0 && (
                  <DetailRow label={`A/S 완료 사진 (${record.completion_photo_urls.length}장)`}>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {record.completion_photo_urls.map((url: string, idx: number) => (
                        <button key={idx} type="button" onClick={() => setLightboxSrc(url)}
                          className="w-20 h-20 rounded-xl overflow-hidden border border-[#34C759]/30 active:opacity-80">
                          <img src={url} alt={`완료사진 ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </DetailRow>
                )}

                <DetailRow label="등록일">
                  <p className="text-[15px] text-black">
                    {record.created_at ? format(new Date(record.created_at), 'yyyy-MM-dd HH:mm') : '-'}
                  </p>
                </DetailRow>

                <div className="h-px bg-black/5 my-4" />

                {/* 완료 / 취소 / 삭제 버튼 */}
                <div className="space-y-2 pb-10">
                  {!isDone ? (
                    <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
                      className="w-full py-3.5 bg-[#34C759] text-white text-[16px] font-semibold rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40">
                      <CheckCircle2 className="w-5 h-5" />
                      {completeMutation.isPending ? '처리중...' : 'A/S 완료 처리'}
                    </button>
                  ) : (
                    <button onClick={() => revertMutation.mutate()} disabled={revertMutation.isPending}
                      className="w-full py-3.5 bg-[#F2F2F7] text-[#8E8E93] text-[16px] font-medium rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40">
                      <RotateCcw className="w-4 h-4" />
                      {revertMutation.isPending ? '처리중...' : '완료 취소'}
                    </button>
                  )}

                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-3 flex items-center justify-center gap-1.5 text-[#FF3B30] text-[15px] font-medium active:opacity-60">
                      <Trash2 className="w-4 h-4" />삭제
                    </button>
                  ) : (
                    <div className="bg-[#FFF2F0] rounded-xl p-4 border border-[#FF3B30]/15 space-y-3">
                      <p className="text-[14px] font-medium text-black text-center">이 A/S를 삭제할까요?</p>
                      <p className="text-[12px] text-[#8E8E93] text-center">삭제 후 복구할 수 없습니다</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-2.5 bg-[#F2F2F7] text-[#3C3C43] text-[15px] font-medium rounded-xl active:opacity-70">취소</button>
                        <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                          className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[15px] font-semibold rounded-xl flex items-center justify-center gap-1.5 active:opacity-80 disabled:opacity-40">
                          <Trash2 className="w-4 h-4" />
                          {deleteMutation.isPending ? '삭제중...' : '삭제 확인'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 라이트박스 */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={lightboxSrc}
            alt="확대 이미지"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 사진 선택 모달 — createPortal로 document.body에 직접 마운트
          (Radix Sheet의 aria-modal/inert 영향권에서 완전히 벗어남) */}
      <PhotoPortalModal
        show={showPhotoSourceModal}
        onClose={() => setShowPhotoSourceModal(false)}
        cameraInputId="req-photo-camera"
        galleryInputId="req-photo-gallery"
      />
      <PhotoPortalModal
        show={showCmpPhotoModal}
        onClose={() => setShowCmpPhotoModal(false)}
        cameraInputId="cmp-photo-camera"
        galleryInputId="cmp-photo-gallery"
      />
    </>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-black/5 last:border-0">
      <p className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}

/* ── Portal 사진 선택 모달
   createPortal → document.body 직접 마운트
   Radix Sheet의 aria-modal/inert 영향권 완전 탈출 */
function PhotoPortalModal({ show, onClose, cameraInputId, galleryInputId }: {
  show: boolean
  onClose: () => void
  cameraInputId: string
  galleryInputId: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || !show) return null

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 mb-8 bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 text-center border-b border-black/5">
          <p className="text-[15px] font-semibold text-black">사진 추가</p>
        </div>
        {/* label htmlFor → Fragment 최상단의 hidden input 직접 트리거 */}
        <label
          htmlFor={cameraInputId}
          onClick={onClose}
          className="block w-full px-5 py-4 text-[16px] text-[#007AFF] border-b border-black/5 active:bg-black/5 cursor-pointer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Camera className="w-5 h-5" />카메라로 촬영
        </label>
        <label
          htmlFor={galleryInputId}
          onClick={onClose}
          className="block w-full px-5 py-4 text-[16px] text-[#007AFF] border-b border-black/5 active:bg-black/5 cursor-pointer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <ImageIcon className="w-5 h-5" />사진첩에서 선택
        </label>
        <button
          onClick={onClose}
          className="w-full py-4 text-[16px] font-semibold text-[#8E8E93] active:bg-black/5"
        >취소</button>
      </div>
    </div>,
    document.body
  )
}
