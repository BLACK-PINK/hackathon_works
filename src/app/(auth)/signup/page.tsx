import { SignupForm } from '@/components/auth/SignupForm'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-[#007AFF] rounded-[22px] mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-4xl">🏗️</span>
          </div>
          <h1 className="text-[24px] font-bold text-black">회원가입</h1>
          <p className="text-[14px] text-[#8E8E93] mt-1">(주)챕터디자인 계정을 만들어보세요</p>
        </div>
        <SignupForm />
      </div>
    </div>
  )
}
