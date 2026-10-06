'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ChevronDown, Plus, Minus, Camera, X, ImageIcon, CheckSquare, Square } from 'lucide-react'
import { sendPushNotification } from '@/lib/usePushNotification'
import { formatPhone } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface AddAsRecordSheetProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profile: any
}

type SiteMode = 'select' | 'manual'

export function AddAsRecordSheet({ open, onClose, onSuccess, profile }: AddAsRecordSheetProps) {
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 요청 사진 input refs
  const reqFileInputRef   = useRef<HTMLInputElement>(null)
  const reqCameraInputRef = useRef<HTMLInputElement>(null)
  const [showReqPhotoModal, setShowReqPhotoModal] = useState(false)

  // 완료 사진 input refs
  const cmpFileInputRef   = useRef<HTMLInputElement>(null)
  const cmpCameraInputRef = useRef<HTMLInputElement>(null)
  const [showCmpPhotoModal, setShowCmpPhotoModal] = useState(false)

  // ── 폼 상태
  const [siteMode, setSiteMode]       = useState<SiteMode>('select')
  const [projectId, setProjectId]     = useState('')
  const [siteName, setSiteName]       = useState('')

  const [receivedDate, setReceivedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [receivedBy, setReceivedBy]     = useState('')   // 접수자 (멤버)

  const [visitDate, setVisitDate]     = useState('')
  const [visitHour, setVisitHour]     = useState('')
  const [visitMinute, setVisitMinute] = useState('00')
  const [assignedTo, setAssignedTo]   = useState('')     // AS 담당자 (거래처)

  const [clientName, setClientName]   = useState('')
  const [clientPhone, setClientPhone] = useState('')

  const [contentItems, setContentItems] = useState<string[]>(['', '', ''])
  const [asRequested, setAsRequested]   = useState(false)  // AS 요청 체크박스

  const [resolution, setResolution]   = useState('')

  // 요청 사진 (photo_urls)
  const [reqPhotos, setReqPhotos]           = useState<File[]>([])
  const [reqPhotoPreviews, setReqPhotoPreviews] = useState<string[]>([])

  // 완료 사진 (completion_photo_urls)
  const [cmpPhotos, setCmpPhotos]           = useState<File[]>([])
  const [cmpPhotoPreviews, setCmpPhotoPreviews] = useState<string[]>([])

  const [uploading, setUploading] = useState(false)

  // 열릴 때 스크롤 최상단
  useEffect(() => {
    if (open) {
      const t1 = setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 50)
      const t2 = setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }), 200)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [open])

  // ── 데이터 조회
  const { data: activeProjects = [] } = useQuery({
    queryKey: ['projects-active', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name')
        .eq('company_id', profile.company_id).eq('status', 'active').order('name')
      return data || []
    },
  })
  const { data: completedProjects = [] } = useQuery({
    queryKey: ['projects-completed', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name')
        .eq('company_id', profile.company_id).eq('status', 'completed').order('name')
      return data || []
    },
  })
  const { data: members = [] } = useQuery({
    queryKey: ['members-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('id, name')
        .eq('company_id', profile.company_id).order('name')
      return data || []
    },
  })
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, name, process')
        .eq('company_id', profile.company_id).order('name')
      return data || []
    },
  })

  // ── 유틸
  const buildVisitDatetime = () => {
    if (!visitDate) return null
    if (visitHour) return `${visitDate}T${visitHour.padStart(2, '0')}:${visitMinute}:00`
    return `${visitDate}T00:00:00`
  }
  const hourOptions   = Array.from({ length: 24 }, (_, i) => String(i))
  const minuteOptions = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

  // ── 사진 추가/제거 헬퍼
  const handlePhotoSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
    setPreviews: React.Dispatch<React.SetStateAction<string[]>>,
    current: File[],
  ) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const remaining = 5 - current.length
    const toAdd = files.slice(0, remaining)
    if (toAdd.length < files.length) toast.warning('최대 5장까지 첨부 가능합니다')
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => setPreviews(p => [...p, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
    setFiles(p => [...p, ...toAdd])
    e.target.value = ''
  }
  const removePhoto = (
    idx: number,
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
    setPreviews: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setFiles(p => p.filter((_, i) => i !== idx))
    setPreviews(p => p.filter((_, i) => i !== idx))
  }

  // ── Supabase Storage 업로드
  const uploadPhotos = async (files: File[], folder: string): Promise<string[]> => {
    if (!files.length) return []
    const urls: string[] = []
    for (const file of files) {
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${folder}/${profile.company_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('as-photos').upload(path, file, { upsert: false })
      if (error) { console.error('[photo upload]', error); continue }
      const { data: urlData } = supabase.storage.from('as-photos').getPublicUrl(path)
      if (urlData?.publicUrl) urls.push(urlData.publicUrl)
    }
    return urls
  }

  // ── 저장
  const addRecord = useMutation({
    mutationFn: async () => {
      setUploading(true)
      const [reqUrls, cmpUrls] = await Promise.all([
        uploadPhotos(reqPhotos, 'as-request'),
        uploadPhotos(cmpPhotos, 'as-completion'),
      ])
      setUploading(false)

      const filledItems    = contentItems.filter(s => s.trim())
      const combinedContent = filledItems.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n')

      // 기본 insert (기존 컬럼)
      const { data: inserted, error } = await supabase.from('as_records').insert({
        company_id:   profile.company_id,
        received_date: receivedDate,
        visit_date:   buildVisitDatetime(),
        content:      combinedContent,
        resolution:   resolution.trim() || null,
        handler_name: receivedBy || null,
        project_id:   siteMode === 'select' ? (projectId || null) : null,
        site_name:    siteMode === 'manual'  ? (siteName.trim() || null) : null,
        client_name:  clientName.trim()  || null,
        client_phone: clientPhone.trim() || null,
        vendor_assigned_to: assignedTo || null,
        photo_urls:   reqUrls.length > 0 ? reqUrls : null,
        status:       'received',
        created_by:   profile.id,
      }).select('id').single()
      if (error) throw error

      // 신규 컬럼 업데이트 (SQL 실행 전이면 조용히 스킵)
      if (inserted?.id) {
        try {
          await supabase.from('as_records').update({
            as_requested: asRequested,
            completion_photo_urls: cmpUrls.length > 0 ? cmpUrls : null,
          }).eq('id', inserted.id)
        } catch (newColErr) {
          console.warn('[AS insert] 신규 컬럼 미적용 — Supabase SQL 실행 필요:', newColErr)
        }
      }
    },
    onSuccess: () => {
      const count = contentItems.filter(s => s.trim()).length
      toast.success(`A/S ${count}건이 접수되었습니다`)
      sendPushNotification({
        companyId: profile.company_id,
        title: '🔧 A/S 신규 접수',
        body: contentItems.find(s => s.trim()) || 'A/S가 접수되었습니다',
        url: '/as',
        tag: 'as-new',
      })
      handleClose()
      onSuccess()
    },
    onError: (e: any) => {
      setUploading(false)
      console.error('[AddAsRecordSheet]', e)
      toast.error('접수에 실패했습니다')
    },
  })

  const handleClose = () => {
    setSiteMode('select'); setProjectId(''); setSiteName('')
    setReceivedDate(format(new Date(), 'yyyy-MM-dd')); setReceivedBy('')
    setVisitDate(''); setVisitHour(''); setVisitMinute('00'); setAssignedTo('')
    setClientName(''); setClientPhone('')
    setContentItems(['', '', '']); setAsRequested(false)
    setResolution('')
    setReqPhotos([]); setReqPhotoPreviews([])
    setCmpPhotos([]); setCmpPhotoPreviews([])
    onClose()
  }

  const handleSubmit = () => {
    if (!contentItems.some(s => s.trim())) { toast.error('A/S 내용을 1건 이상 입력해주세요'); return }
    addRecord.mutate()
  }

  const addItem    = () => setContentItems(p => [...p, ''])
  const removeItem = (idx: number) => { if (contentItems.length <= 1) return; setContentItems(p => p.filter((_, i) => i !== idx)) }
  const updateItem = (idx: number, val: string) => setContentItems(p => p.map((s, i) => i === idx ? val : s))

  const isPending = addRecord.isPending || uploading

  // 사진 row 공통 컴포넌트 (인라인)
  const PhotoRow = ({
    previews, files, onAdd, onRemove, label,
  }: {
    previews: string[]
    files: File[]
    onAdd: () => void
    onRemove: (i: number) => void
    label: string
  }) => (
    <div>
      <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
        {label} <span className="normal-case tracking-normal font-normal">({files.length}/5)</span>
      </label>
      <div className="flex gap-2 flex-wrap">
        {previews.map((src, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-black/10">
            <img src={src} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onRemove(idx)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        {files.length < 5 && (
          <button type="button" onClick={onAdd}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C7C7CC] flex flex-col items-center justify-center gap-1 active:opacity-60 bg-[#F2F2F7]">
            <Camera className="w-5 h-5 text-[#8E8E93]" />
            <span className="text-[10px] text-[#8E8E93]">사진 추가</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* ── 파일 input: Sheet 바깥(Fragment 최상단)에 배치해야 iOS에서 정상 동작 ── */}
      <input id="add-req-gallery" ref={reqFileInputRef} type="file" accept="image/*" multiple
        onChange={(e) => { handlePhotoSelect(e, setReqPhotos, setReqPhotoPreviews, reqPhotos); setShowReqPhotoModal(false) }}
        className="hidden" />
      <input id="add-req-camera" ref={reqCameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={(e) => { handlePhotoSelect(e, setReqPhotos, setReqPhotoPreviews, reqPhotos); setShowReqPhotoModal(false) }}
        className="hidden" />
      <input id="add-cmp-gallery" ref={cmpFileInputRef} type="file" accept="image/*" multiple
        onChange={(e) => { handlePhotoSelect(e, setCmpPhotos, setCmpPhotoPreviews, cmpPhotos); setShowCmpPhotoModal(false) }}
        className="hidden" />
      <input id="add-cmp-camera" ref={cmpCameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={(e) => { handlePhotoSelect(e, setCmpPhotos, setCmpPhotoPreviews, cmpPhotos); setShowCmpPhotoModal(false) }}
        className="hidden" />

    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-0 pb-0 flex flex-col"
        style={{ height: '92dvh', maxHeight: '92dvh' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* 헤더 */}
        <SheetHeader className="px-5 py-3 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <button onClick={handleClose} className="text-[#007AFF] text-[16px]">취소</button>
            <SheetTitle className="text-[17px] font-semibold">A/S 접수</SheetTitle>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="text-[#007AFF] text-[16px] font-semibold disabled:opacity-40"
            >
              {uploading ? '사진업로드...' : addRecord.isPending ? '저장중...' : '접수'}
            </button>
          </div>
        </SheetHeader>

        {/* 스크롤 영역 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' as any }}
        >
          <div className="px-5 py-4 space-y-5">

            {/* ① 현장 선택 */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">현장</label>
              {/* 탭 */}
              <div className="flex bg-[#F2F2F7] rounded-xl p-1 mb-2.5 gap-1">
                <button
                  onClick={() => setSiteMode('select')}
                  className={cn('flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                    siteMode === 'select' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#8E8E93]')}>
                  목록에서 선택
                </button>
                <button
                  onClick={() => setSiteMode('manual')}
                  className={cn('flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                    siteMode === 'manual' ? 'bg-white text-[#FF9500] shadow-sm' : 'text-[#8E8E93]')}>
                  직접 입력
                </button>
              </div>
              {siteMode === 'select' ? (
                <div className="relative">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black outline-none appearance-none">
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
                  placeholder="현장명 직접 입력"
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none" />
              )}
            </div>

            {/* ② 접수일 / 접수자 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">접수일</label>
                <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">접수자</label>
                <div className="relative">
                  <select value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}
                    className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none appearance-none">
                    <option value="">선택</option>
                    {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none" />
                </div>
              </div>
            </div>

            {/* ③ 방문 예정일 / AS 담당자(거래처) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">
                  방문예정일 <span className="normal-case tracking-normal font-normal text-[11px]">(선택)</span>
                </label>
                <input type="date" value={visitDate}
                  onChange={(e) => { setVisitDate(e.target.value); if (!e.target.value) { setVisitHour(''); setVisitMinute('00') } }}
                  className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none" />
                {/* 시간 선택 (방문일 있을 때만) */}
                {visitDate && (
                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <div className="relative">
                      <select value={visitHour} onChange={(e) => setVisitHour(e.target.value)}
                        className="w-full px-2 py-2 bg-[#F2F2F7] rounded-xl text-[13px] text-black outline-none appearance-none">
                        <option value="">시간 미설정</option>
                        {hourOptions.map(h => <option key={h} value={h}>{h}시</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8E8E93] pointer-events-none" />
                    </div>
                    <div className="relative">
                      <select value={visitMinute} onChange={(e) => setVisitMinute(e.target.value)}
                        disabled={!visitHour}
                        className="w-full px-2 py-2 bg-[#F2F2F7] rounded-xl text-[13px] text-black outline-none appearance-none disabled:opacity-40">
                        {minuteOptions.map(m => <option key={m} value={m}>{m}분</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8E8E93] pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">AS 담당자</label>
                <div className="relative">
                  <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black outline-none appearance-none">
                    <option value="">거래처 선택</option>
                    {vendors.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}{v.process ? ` (${v.process})` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93] pointer-events-none" />
                </div>
              </div>
            </div>

            {/* ④ 고객명 / 연락처 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">고객명</label>
                <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                  placeholder="고객 이름"
                  className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">연락처</label>
                <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-3 bg-[#F2F2F7] rounded-xl text-[14px] text-black placeholder:text-[#C7C7CC] outline-none" />
              </div>
            </div>

            {/* ⑤ A/S 요청 내용 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">A/S 요청 내용 *</label>
                <span className="text-[11px] text-[#8E8E93]">{contentItems.filter(s => s.trim()).length}건 입력됨</span>
              </div>
              <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                {contentItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 px-3 py-2.5 border-b border-black/5 last:border-b-0">
                    <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-[#007AFF]/15 text-[#007AFF] text-[11px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
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

              {/* AS 요청 체크박스 */}
              <button
                type="button"
                onClick={() => setAsRequested(v => !v)}
                className="mt-3 flex items-center gap-2 active:opacity-60"
              >
                {asRequested
                  ? <CheckSquare className="w-5 h-5 text-[#007AFF]" />
                  : <Square className="w-5 h-5 text-[#C7C7CC]" />
                }
                <span className={cn('text-[14px] font-medium', asRequested ? 'text-[#007AFF]' : 'text-[#8E8E93]')}>
                  AS 요청 완료 (거래처에 전달함)
                </span>
              </button>
            </div>

            {/* ⑥ A/S 요청 사진 첨부 */}
            <PhotoRow
              previews={reqPhotoPreviews}
              files={reqPhotos}
              label="A/S 요청 사진"
              onAdd={() => setShowReqPhotoModal(true)}
              onRemove={(i) => removePhoto(i, setReqPhotos, setReqPhotoPreviews)}
            />

            {/* ⑦ A/S 처리 내용 (MEMO) */}
            <div>
              <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide mb-1.5 block">A/S 처리 내용</label>
              <textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
                placeholder="처리한 내용을 입력하세요 (선택)" rows={3}
                className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-black placeholder:text-[#C7C7CC] outline-none resize-none" />
            </div>

            {/* ⑧ A/S 완료 사진 첨부 */}
            <PhotoRow
              previews={cmpPhotoPreviews}
              files={cmpPhotos}
              label="A/S 완료 사진"
              onAdd={() => setShowCmpPhotoModal(true)}
              onRemove={(i) => removePhoto(i, setCmpPhotos, setCmpPhotoPreviews)}
            />

            <div className="pb-10" />
          </div>
        </div>
      </SheetContent>

      {/* ── 사진 선택 모달 — createPortal로 document.body에 직접 마운트 */}
      {showReqPhotoModal && (
        <PhotoPortalModal
          onClose={() => setShowReqPhotoModal(false)}
          cameraInputId="add-req-camera"
          galleryInputId="add-req-gallery"
        />
      )}
      {showCmpPhotoModal && (
        <PhotoPortalModal
          onClose={() => setShowCmpPhotoModal(false)}
          cameraInputId="add-cmp-camera"
          galleryInputId="add-cmp-gallery"
        />
      )}
    </Sheet>
    </>
  )
}

/* ── Portal 사진 선택 모달
   createPortal → document.body 직접 마운트
   Radix Sheet의 aria-modal/inert 영향권 완전 탈출 */
function PhotoPortalModal({
  onClose, cameraInputId, galleryInputId,
}: {
  onClose: () => void
  cameraInputId: string
  galleryInputId: string
}) {
  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 mb-8 bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 text-center border-b border-black/5">
          <p className="text-[15px] font-semibold text-black">사진 추가</p>
        </div>
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
