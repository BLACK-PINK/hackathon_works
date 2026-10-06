import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const vapidEmail = process.env.VAPID_EMAIL
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

    if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
      console.error('[push/send] VAPID 환경변수 미설정')
      return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
    }

    // VAPID Public Key에서 = 패딩 제거 (URL safe Base64 필수)
    webpush.setVapidDetails(vapidEmail, vapidPublicKey.replace(/=/g, ''), vapidPrivateKey)

    // 인증 확인은 일반 클라이언트로
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 구독 조회는 service_role 클라이언트로 (RLS 우회 — 다른 사용자 구독도 조회)
    const adminSupabase = createServiceClient()

    const { userIds, companyId, excludeUserId, payload } = await req.json()

    let query = adminSupabase.from('push_subscriptions').select('*')

    if (userIds && userIds.length > 0) {
      query = query.in('user_id', userIds)
    } else if (companyId) {
      query = query.eq('company_id', companyId)
      // 본인 제외 (신규현장 등록 시 등록자 본인 제외)
      if (excludeUserId) {
        query = query.neq('user_id', excludeUserId)
      }
    } else {
      return NextResponse.json({ error: 'userIds or companyId required' }, { status: 400 })
    }

    const { data: subscriptions, error: subError } = await query
    console.log('[push/send] 구독 수:', subscriptions?.length, '에러:', subError?.message)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: '구독자 없음' })
    }

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        ).catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await adminSupabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
          throw err
        })
      )
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message)
    console.log('[push/send] 발송 결과 sent:', sent, 'failed:', failed)

    return NextResponse.json({ ok: true, sent, total: subscriptions.length })
  } catch (e: any) {
    console.error('[push/send]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
