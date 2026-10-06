import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const vapidEmail = process.env.VAPID_EMAIL
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

    if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json({ error: 'VAPID 환경변수 미설정', vapidEmail: !!vapidEmail, vapidPublicKey: !!vapidPublicKey, vapidPrivateKey: !!vapidPrivateKey }, { status: 500 })
    }

    // VAPID Public Key에서 = 패딩 제거 (URL safe Base64 필수)
    webpush.setVapidDetails(vapidEmail, vapidPublicKey.replace(/=/g, ''), vapidPrivateKey)

    // 로그인 유저 확인
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 본인 profile → company_id 조회
    const { data: profile } = await supabase
      .from('user_profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 })

    // service_role로 같은 회사 구독 전체 조회
    const adminSupabase = createServiceClient()
    const { data: subscriptions, error: subError } = await adminSupabase
      .from('push_subscriptions')
      .select('*')
      .eq('company_id', profile.company_id)

    if (subError) {
      return NextResponse.json({ error: subError.message, message: 'DB 조회 실패' }, { status: 500 })
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: '구독자 없음 — 알림 설정에서 토글을 켜주세요' })
    }

    const payload = JSON.stringify({
      title: '🔔 (주)챕터디자인 테스트',
      body: '푸시 알림이 정상 작동합니다!',
      url: '/profile',
      tag: 'test',
    })

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await adminSupabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
          throw err
        })
      )
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r: any) => r.reason?.message || r.reason?.statusCode)

    return NextResponse.json({
      ok: true,
      sent,
      total: subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e: any) {
    console.error('[push/test]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
