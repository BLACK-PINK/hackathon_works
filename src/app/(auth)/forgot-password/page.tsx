'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        toast.error('이메일 전송에 실패했습니다')
        return
      }
      setSent(true)
    } catch {
      toast.error('오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#007AFF] rounded-[22px] mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-4xl">🏗️</span>
          </div>
          <h1 className="text-[28px] font-bold text-black tracking-tight">(주)챕터디자인</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">비밀번호 찾기</p>
        </div>

        {sent ? (
          <div className="ios-card p-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-[#34C759] mx-auto" />
            <p className="text-[17px] font-semibold text-black">이메일을 전송했습니다!</p>
            <p className="text-[14px] text-[#8E8E93]">
              <span className="font-medium text-black">{email}</span>으로<br />
              비밀번호 재설정 링크를 보냈습니다.<br />
              이메일을 확인해 주세요.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="ios-btn-primary mt-4"
            >
              로그인으로 돌아가기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-[14px] text-[#8E8E93] text-center px-2">
              가입하신 이메일을 입력하시면<br />비밀번호 재설정 링크를 보내드립니다.
            </p>

            <div className="ios-card p-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 주소"
                className="ios-input"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="ios-btn-primary flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '재설정 링크 보내기'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full flex items-center justify-center gap-1 text-[#8E8E93] text-[15px] py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              로그인으로 돌아가기
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
