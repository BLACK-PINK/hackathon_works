'use client'

import { useState } from 'react'
import { usePushNotification } from '@/lib/usePushNotification'
import { Bell, BellOff, BellRing, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ── iOS 홈 화면 추가 안내 모달 ── */
function IOSInstallGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 px-4 pb-6">
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-[18px] font-bold text-black">홈 화면에 추가하기</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7]">
            <X className="w-4 h-4 text-[#8E8E93]" />
          </button>
        </div>
        <p className="px-5 pb-4 text-[13px] text-[#8E8E93] leading-relaxed">
          iOS Safari에서 푸시 알림을 받으려면<br />홈 화면에 앱을 추가해야 합니다.
        </p>
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[12px] font-bold">1</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-black">하단 공유 버튼 탭</p>
              <p className="text-[12px] text-[#8E8E93] mt-0.5">Safari 하단 가운데 공유 버튼(□↑)을 누르세요</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[12px] font-bold">2</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-black">"홈 화면에 추가" 선택</p>
              <p className="text-[12px] text-[#8E8E93] mt-0.5">스크롤해서 찾아주세요</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[#34C759] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-[12px] font-bold">3</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-black">홈 화면 아이콘으로 앱 열기</p>
              <p className="text-[12px] text-[#8E8E93] mt-0.5">추가된 아이콘으로 열면 알림 설정 가능</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-6">
          <button onClick={onClose} className="w-full py-3.5 bg-[#007AFF] text-white text-[16px] font-semibold rounded-2xl active:opacity-80">
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 메인 토글 컴포넌트 ── */
export function PushNotificationToggle() {
  const { permission, isSubscribed, loading, isSupported, subscribe, unsubscribe } = usePushNotification()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [testLoading, setTestLoading] = useState(false)

  const isIOS = typeof window !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)

  // iOS Safari 브라우저 (홈 화면 미추가)
  if (isIOS && !isStandalone) {
    return (
      <>
        <div className="py-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF9500]/10 flex items-center justify-center flex-shrink-0">
              <BellOff className="w-5 h-5 text-[#FF9500]" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-black">푸시 알림</p>
              <p className="text-[12px] text-[#FF9500] font-medium mt-0.5">홈 화면에 추가 후 사용 가능</p>
            </div>
          </div>
          <button
            onClick={() => setShowIOSGuide(true)}
            className="w-full py-3 bg-[#007AFF]/10 text-[#007AFF] text-[14px] font-semibold rounded-xl active:opacity-70"
          >
            📲 홈 화면 추가 방법 보기
          </button>
        </div>
        {showIOSGuide && <IOSInstallGuideModal onClose={() => setShowIOSGuide(false)} />}
      </>
    )
  }

  // 지원 안 되는 브라우저
  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="w-9 h-9 rounded-xl bg-[#F2F2F7] flex items-center justify-center">
          <BellOff className="w-5 h-5 text-[#C7C7CC]" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-medium text-black">푸시 알림</p>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">이 브라우저는 지원하지 않습니다</p>
        </div>
      </div>
    )
  }

  // 알림 차단된 경우
  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="w-9 h-9 rounded-xl bg-[#FF3B30]/10 flex items-center justify-center">
          <BellOff className="w-5 h-5 text-[#FF3B30]" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-medium text-black">푸시 알림</p>
          <p className="text-[12px] text-[#FF3B30] mt-0.5">알림이 차단되었습니다</p>
          <p className="text-[11px] text-[#8E8E93] mt-0.5">설정 → ChapterWorks → 알림 허용으로 변경해주세요</p>
        </div>
      </div>
    )
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      const ok = await unsubscribe()
      if (ok) toast.success('푸시 알림을 해제했습니다')
      else toast.error('알림 해제에 실패했습니다')
    } else {
      const { ok, errorMsg } = await subscribe()
      if (ok) toast.success('푸시 알림을 켰습니다 🔔')
      else if (permission !== 'denied') toast.error(`알림 등록 실패: ${errorMsg || '알 수 없는 오류'}`)
    }
  }

  // 테스트 알림 발송
  const handleTest = async () => {
    setTestLoading(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sent > 0) {
        toast.success(`테스트 알림 발송 완료 🔔 (${data.sent}명)`)
      } else {
        toast.error(`발송 실패: ${data.message || data.error || JSON.stringify(data)}`)
      }
    } catch (e: any) {
      toast.error(`오류: ${e.message}`)
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="py-3 space-y-3">
      {/* 토글 행 */}
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center',
          isSubscribed ? 'bg-[#34C759]/15' : 'bg-[#F2F2F7]'
        )}>
          {isSubscribed
            ? <BellRing className="w-5 h-5 text-[#34C759]" />
            : <Bell className="w-5 h-5 text-[#8E8E93]" />
          }
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-medium text-black">푸시 알림</p>
          <p className="text-[12px] text-[#8E8E93] mt-0.5">
            {isSubscribed ? '알림이 켜져 있습니다' : '업무 알림을 받으려면 켜주세요'}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            'relative w-12 h-7 rounded-full transition-colors duration-200 disabled:opacity-50',
            isSubscribed ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'
          )}
        >
          <span className={cn(
            'absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all duration-200',
            isSubscribed ? 'left-6' : 'left-1'
          )} />
        </button>
      </div>

      {/* 테스트 알림 버튼 — 구독 중일 때만 표시 */}
      {isSubscribed && (
        <button
          onClick={handleTest}
          disabled={testLoading}
          className="w-full py-2.5 bg-[#34C759]/10 text-[#34C759] text-[13px] font-semibold rounded-xl active:opacity-70 disabled:opacity-40"
        >
          {testLoading ? '발송 중...' : '🔔 테스트 알림 보내기'}
        </button>
      )}
    </div>
  )
}
