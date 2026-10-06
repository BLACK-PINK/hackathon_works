'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
})

type FormData = z.infer<typeof schema>

const SAVED_EMAIL_KEY = 'cw_saved_email'
const SAVED_PW_KEY = 'cw_saved_pw'
const REMEMBER_KEY = 'cw_remember'

export function LoginForm() {
  const router = useRouter()
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // 저장된 로그인 정보 불러오기
  useEffect(() => {
    const savedRemember = localStorage.getItem(REMEMBER_KEY) === 'true'
    setRemember(savedRemember)
    if (savedRemember) {
      const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY) || ''
      const savedPw = localStorage.getItem(SAVED_PW_KEY) || ''
      setValue('email', savedEmail)
      setValue('password', savedPw)

      // 저장된 정보 있으면 자동 로그인 시도
      if (savedEmail && savedPw) {
        autoLogin(savedEmail, savedPw)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const autoLogin = async (email: string, password: string) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) {
        window.location.href = '/dashboard'
      } else {
        // 자동 로그인 실패 시 저장 정보 삭제 + 에러 표시
        localStorage.removeItem(SAVED_EMAIL_KEY)
        localStorage.removeItem(SAVED_PW_KEY)
        localStorage.removeItem(REMEMBER_KEY)
        setRemember(false)
        if (error.message?.includes('Email not confirmed')) {
          toast.error('이메일 인증이 필요합니다')
        } else {
          toast.error(`자동 로그인 실패: ${error.message}`)
        }
      }
    } catch (e: any) {
      toast.error('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        // 에러 코드별 상세 메시지
        if (error.message?.includes('Email not confirmed')) {
          toast.error('이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해주세요')
        } else if (error.message?.includes('Invalid login credentials')) {
          toast.error('이메일 또는 비밀번호가 올바르지 않습니다')
        } else if (error.message?.includes('Too many requests')) {
          toast.error('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요')
        } else {
          toast.error(`로그인 실패: ${error.message}`)
        }
        return
      }

      // 자동 로그인 체크 시 저장
      if (remember) {
        localStorage.setItem(SAVED_EMAIL_KEY, data.email)
        localStorage.setItem(SAVED_PW_KEY, data.password)
        localStorage.setItem(REMEMBER_KEY, 'true')
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY)
        localStorage.removeItem(SAVED_PW_KEY)
        localStorage.removeItem(REMEMBER_KEY)
      }

      window.location.href = '/dashboard'
    } catch {
      toast.error('로그인 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="ios-card p-4 space-y-3">
          <div>
            <input
              {...register('email')}
              type="email"
              placeholder="이메일"
              autoComplete="email"
              className="ios-input"
            />
            {errors.email && (
              <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.email.message}</p>
            )}
          </div>
          <div className="ios-divider" />
          <div className="relative">
            <input
              {...register('password')}
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="ios-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {errors.password && (
              <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.password.message}</p>
            )}
          </div>
        </div>

        {/* 자동 로그인 체크박스 */}
        <button
          type="button"
          onClick={() => setRemember(!remember)}
          className="flex items-center gap-2 w-full px-1"
        >
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
            remember
              ? 'bg-[#007AFF] border-[#007AFF]'
              : 'bg-white border-[#C7C7CC]'
          }`}>
            {remember && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-[15px] text-[#3C3C43]">자동 로그인</span>
        </button>

        <button
          type="submit"
          disabled={loading}
          className="ios-btn-primary flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '로그인'}
        </button>
      </form>

      <div className="flex items-center justify-center gap-6 pt-2">
        <Link href="/signup" className="text-[#007AFF] text-[15px] font-medium">
          회원가입
        </Link>
        <span className="text-[#C7C7CC]">|</span>
        <Link href="/forgot-password" className="text-[#8E8E93] text-[15px]">비밀번호 찾기</Link>
      </div>
    </div>
  )
}
