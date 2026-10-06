'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  phone: z.string().optional(),
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
  passwordConfirm: z.string(),
}).refine((d) => d.password === d.passwordConfirm, {
  message: '비밀번호가 일치하지 않습니다',
  path: ['passwordConfirm'],
})

type FormData = z.infer<typeof schema>

export function SignupForm() {
  const router = useRouter()
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { name: data.name, phone: data.phone },
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (authData.user) {
        // 세션 저장 후 온보딩으로
        router.push(`/onboarding?name=${encodeURIComponent(data.name)}&phone=${encodeURIComponent(data.phone || '')}`)
      }
    } catch {
      toast.error('회원가입 중 오류가 발생했습니다')
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
              {...register('name')}
              type="text"
              placeholder="이름"
              autoComplete="name"
              className="ios-input"
            />
            {errors.name && (
              <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.name.message}</p>
            )}
          </div>
          <div className="ios-divider" />
          <div>
            <input
              {...register('phone')}
              type="tel"
              placeholder="연락처 (선택)"
              autoComplete="tel"
              className="ios-input"
            />
          </div>
          <div className="ios-divider" />
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
              placeholder="비밀번호 (6자 이상)"
              autoComplete="new-password"
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
          <div className="ios-divider" />
          <div>
            <input
              {...register('passwordConfirm')}
              type={showPw ? 'text' : 'password'}
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              className="ios-input"
            />
            {errors.passwordConfirm && (
              <p className="text-[#FF3B30] text-xs mt-1 px-1">{errors.passwordConfirm.message}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="ios-btn-primary flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '가입하기'}
        </button>
      </form>

      <div className="text-center pt-2">
        <span className="text-[#8E8E93] text-[14px]">이미 계정이 있으신가요? </span>
        <Link href="/login" className="text-[#007AFF] text-[14px] font-medium">
          로그인
        </Link>
      </div>
    </div>
  )
}
