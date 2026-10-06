'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, Image as ImageIcon, X, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'

interface PhotoUploaderProps {
  urls: string[]
  onChange: (urls: string[]) => void
  companyId: string
  maxCount?: number
}

/** 파일 → base64 Data URL 변환 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 현장 사진 업로드 + 미리보기 컴포넌트
 *
 * 업로드 전략:
 *   1. Supabase Storage `site-photos` 버킷 업로드 시도
 *   2. 버킷 없음 / RLS 오류 → base64 Data URL로 fallback 저장
 *      (DB 컬럼 있으면 base64 그대로 저장, 나중에 버킷 생성 후 마이그레이션 가능)
 */
export function PhotoUploader({ urls, onChange, companyId, maxCount = 5 }: PhotoUploaderProps) {
  const supabase = createClient()

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // ── 파일 업로드 처리
  const handleFiles = async (files: FileList | null) => {
    setShowPicker(false)
    if (!files || files.length === 0) return

    const remaining = maxCount - urls.length
    if (remaining <= 0) {
      toast.error(`사진은 최대 ${maxCount}장까지 첨부할 수 있습니다`)
      return
    }

    const selected = Array.from(files).slice(0, remaining)
    setUploading(true)

    const uploaded: string[] = []

    try {
      for (const file of selected) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: 파일 크기가 10MB를 초과합니다`)
          continue
        }

        // ── 1차: Supabase Storage 업로드 시도
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const path = `${companyId}/${safeName}`

        const { error } = await supabase.storage
          .from('site-photos')
          .upload(path, file, { upsert: false, contentType: file.type })

        if (!error) {
          // ✅ 업로드 성공
          const { data: urlData } = supabase.storage.from('site-photos').getPublicUrl(path)
          uploaded.push(urlData.publicUrl)
          continue
        }

        // ── 2차: 버킷 없음 / 권한 오류 → base64 fallback
        const isBucketMissing =
          error.message?.includes('Bucket not found') ||
          error.message?.includes('bucket') ||
          (error as any).statusCode === '404' ||
          (error as any).status === 404

        const isRlsError =
          error.message?.includes('row-level security') ||
          error.message?.includes('policy') ||
          (error as any).statusCode === '403' ||
          (error as any).status === 403

        if (isBucketMissing || isRlsError) {
          // base64로 변환해서 로컬 저장
          try {
            const dataUrl = await fileToDataUrl(file)
            uploaded.push(dataUrl)
            toast.warning(
              isBucketMissing
                ? '사진을 임시 저장했습니다 (Supabase 스토리지 버킷 생성 후 정식 저장됩니다)'
                : '사진을 임시 저장했습니다 (스토리지 권한 설정 필요)',
              { duration: 4000 }
            )
          } catch {
            toast.error(`사진 처리 실패: ${file.name}`)
          }
          continue
        }

        // 그 외 오류
        console.error('[PhotoUploader] 업로드 오류:', error)
        toast.error(`업로드 실패: ${file.name}`)
      }

      if (uploaded.length > 0) {
        onChange([...urls, ...uploaded])
      }
    } finally {
      setUploading(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (galleryInputRef.current) galleryInputRef.current.value = ''
    }
  }

  const removeUrl = (idx: number) => onChange(urls.filter((_, i) => i !== idx))
  const canAdd = urls.length < maxCount && !uploading

  return (
    <div>
      {/* 레이블 + 추가 버튼 */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wide">
          현장 사진 (선택){urls.length > 0 && ` ${urls.length}/${maxCount}`}
        </label>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 text-[#007AFF] text-[12px] font-medium active:opacity-60"
          >
            <Camera className="w-3.5 h-3.5" />
            사진 추가
          </button>
        )}
        {uploading && (
          <span className="text-[12px] text-[#8E8E93] animate-pulse">업로드 중...</span>
        )}
      </div>

      {/* 숨긴 input: 카메라 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {/* 숨긴 input: 갤러리 */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* 썸네일 목록 */}
      {urls.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {urls.map((url, i) => (
            <div
              key={i}
              className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F2F2F7]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`현장 사진 ${i + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxUrl(url)}
              />
              {/* 임시저장 배지 (base64) */}
              {url.startsWith('data:') && (
                <span className="absolute bottom-0 inset-x-0 text-center text-[8px] bg-orange-400/80 text-white py-0.5">
                  임시
                </span>
              )}
              <button
                type="button"
                onClick={() => removeUrl(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center active:opacity-60"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-[#C7C7CC] flex flex-col items-center justify-center gap-1 text-[#8E8E93] active:opacity-60"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[10px]">추가</span>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          disabled={uploading}
          className="w-full py-5 border-2 border-dashed border-[#C7C7CC] rounded-xl flex flex-col items-center justify-center gap-1.5 text-[#8E8E93] active:opacity-60 disabled:opacity-40"
        >
          <ImageIcon className="w-6 h-6" />
          <span className="text-[13px]">{uploading ? '처리 중...' : '탭하여 사진 추가'}</span>
          <span className="text-[11px] text-[#C7C7CC]">최대 {maxCount}장 · JPG, PNG, WEBP</span>
        </button>
      )}

      {/* ── 사진 선택 바텀시트 */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowPicker(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white rounded-t-2xl overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-[#E5E5EA] mx-auto mt-3 mb-1" />
            <p className="text-center text-[13px] font-medium text-[#8E8E93] pb-2">
              사진 선택 방식
            </p>

            {/* 카메라 */}
            <button
              type="button"
              onClick={() => {
                setShowPicker(false)
                setTimeout(() => cameraInputRef.current?.click(), 80)
              }}
              className="w-full flex items-center gap-4 px-6 py-4 active:bg-[#F2F2F7] border-t border-black/5"
            >
              <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-[#007AFF]" />
              </div>
              <div className="text-left">
                <p className="text-[16px] font-medium text-black">카메라로 찍기</p>
                <p className="text-[12px] text-[#8E8E93]">현장에서 바로 촬영</p>
              </div>
            </button>

            {/* 앨범 */}
            <button
              type="button"
              onClick={() => {
                setShowPicker(false)
                setTimeout(() => galleryInputRef.current?.click(), 80)
              }}
              className="w-full flex items-center gap-4 px-6 py-4 active:bg-[#F2F2F7] border-t border-black/5"
            >
              <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="w-5 h-5 text-[#34C759]" />
              </div>
              <div className="text-left">
                <p className="text-[16px] font-medium text-black">앨범에서 선택</p>
                <p className="text-[12px] text-[#8E8E93]">
                  최대 {maxCount - urls.length}장 선택 가능
                </p>
              </div>
            </button>

            {/* 취소 */}
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="w-full py-4 text-[16px] font-medium text-[#FF3B30] border-t border-black/5 active:bg-[#F2F2F7]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white active:opacity-70"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="현장 사진"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
