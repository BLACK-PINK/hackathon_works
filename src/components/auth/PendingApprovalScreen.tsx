'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, LogOut } from 'lucide-react'

export function PendingApprovalScreen() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm ios-card p-8 text-center space-y-5">
        {/* 아이콘 */}
        <div className="w-20 h-20 bg-[#FF9500]/10 rounded-full mx-auto flex items-center justify-center">
          <Clock className="w-10 h-10 text-[#FF9500]" />
        </div>

        {/* 제목 */}
        <div>
          <h1 className="text-[22px] font-bold text-black">승인 대기 중</h1>
          <p className="text-[14px] text-[#8E8E93] mt-2 leading-relaxed">
            가입 신청이 완료되었습니다.<br />
            관리자(대표)가 계정을 승인하면<br />
            서비스를 이용할 수 있습니다.
          </p>
        </div>

        {/* 안내 박스 */}
        <div className="bg-[#F2F2F7] rounded-xl px-4 py-3 text-left">
          <p className="text-[12px] text-[#8E8E93] leading-relaxed">
            📌 관리자에게 승인을 요청하거나,<br />
            앱을 다시 열면 승인 여부가 반영됩니다.
          </p>
        </div>

        {/* 로그아웃 버튼 */}
        <button
          onClick={handleLogout}
          className="w-full h-12 flex items-center justify-center gap-2 bg-[#F2F2F7] text-[#8E8E93] text-[15px] rounded-xl active:opacity-70"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </div>
  )
}
