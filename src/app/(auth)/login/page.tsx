import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#007AFF] rounded-[22px] mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-4xl">🏗️</span>
          </div>
          <h1 className="text-[28px] font-bold text-black tracking-tight">(주)챕터디자인</h1>
          <p className="text-[15px] text-[#8E8E93] mt-1">인테리어 통합 업무관리</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
