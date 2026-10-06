'use client'

import { useState, useEffect, useCallback } from 'react'

// VAPID Public Key — 환경변수에서 읽기 (= 패딩 제거)
const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').replace(/=/g, '')

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function usePushNotification() {
  const [permission, setPermission] = useState<PushPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  // iOS Safari는 홈 화면 추가(standalone) 상태에서만 푸시 지원
  const isIOS = typeof window !== 'undefined'
    && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
  const isSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && (!isIOS || isStandalone) // iOS는 standalone(홈 화면 추가) 모드에서만 지원

  useEffect(() => {
    if (!isSupported) { setPermission('unsupported'); return }
    setPermission(Notification.permission as PushPermission)

    // 기존 구독 확인
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [isSupported])

  // Service Worker 등록
  const registerSW = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      const existing = await navigator.serviceWorker.getRegistration('/sw.js')
      if (existing) return existing
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      return reg
    } catch (e) {
      console.error('[SW register]', e)
      return null
    }
  }, [])

  // 구독 요청
  const subscribe = useCallback(async (): Promise<{ ok: boolean; errorMsg?: string }> => {
    if (!isSupported) return { ok: false, errorMsg: '미지원 브라우저' }
    setLoading(true)
    try {
      console.log('[push] 1. requestPermission 시작')
      const perm = await Notification.requestPermission()
      console.log('[push] 2. permission:', perm)
      setPermission(perm as PushPermission)
      if (perm !== 'granted') { setLoading(false); return { ok: false, errorMsg: `권한거부: ${perm}` } }

      console.log('[push] 3. SW 등록 시작')
      const reg = await registerSW()
      console.log('[push] 4. SW:', reg?.scope)
      if (!reg) { setLoading(false); return { ok: false, errorMsg: 'Service Worker 등록 실패' } }

      console.log('[push] 5. pushManager.subscribe, key:', VAPID_PUBLIC_KEY?.slice(0, 20))
      if (!VAPID_PUBLIC_KEY) {
        setLoading(false)
        return { ok: false, errorMsg: 'VAPID 공개키 미설정 (환경변수 확인 필요)' }
      }
      let sub: PushSubscription
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      } catch (subErr: any) {
        console.error('[push] pushManager.subscribe 실패:', subErr?.name, subErr?.message)
        setLoading(false)
        return { ok: false, errorMsg: `구독실패: ${subErr?.name} - ${subErr?.message}` }
      }
      console.log('[push] 6. 구독 성공:', sub.endpoint?.slice(0, 50))

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      const resBody = await res.json().catch(() => ({}))
      console.log('[push] 7. 서버 응답:', res.status, resBody)

      if (res.ok) { setIsSubscribed(true); setLoading(false); return { ok: true } }
      setLoading(false)
      return { ok: false, errorMsg: `서버오류 ${res.status}: ${resBody?.error || ''}` }
    } catch (e: any) {
      console.error('[push subscribe error]', e?.name, e?.message)
      setLoading(false)
      return { ok: false, errorMsg: `${e?.name}: ${e?.message}` }
    }
  }, [isSupported, registerSW])

  // 구독 해제
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setIsSubscribed(false); setLoading(false); return true }

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      await sub.unsubscribe()
      setIsSubscribed(false)
      setLoading(false)
      return true
    } catch (e) {
      console.error('[push unsubscribe]', e)
      setLoading(false)
      return false
    }
  }, [isSupported])

  return { permission, isSubscribed, loading, isSupported, subscribe, unsubscribe }
}

// 서버 API를 통해 알림 발송 (클라이언트에서 호출)
export async function sendPushNotification(params: {
  userIds?: string[]
  companyId?: string
  excludeUserId?: string   // companyId 사용 시 제외할 userId (본인 제외용)
  title: string
  body: string
  url?: string
  tag?: string
}) {
  try {
    const { userIds, companyId, excludeUserId, title, body, url = '/dashboard', tag = 'chapter-works' } = params
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, companyId, excludeUserId, payload: { title, body, url, tag } }),
    })
    return res.ok
  } catch {
    return false
  }
}
