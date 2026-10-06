import { createBrowserClient } from '@supabase/ssr'

// 데모 모드: Supabase URL이 없으면 mock 클라이언트 반환
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const isConfigured =
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL !== 'your_supabase_project_url' &&
  SUPABASE_KEY !== 'your_supabase_anon_key'

export function createClient() {
  if (!isConfigured) {
    // 더미 URL로 초기화 (실제 요청은 실패하지만 앱은 동작)
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    )
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
}

export function isSupabaseConfigured() {
  return !!isConfigured
}
