import { OnboardingFlow } from '@/components/auth/OnboardingFlow'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <OnboardingFlow />
      </div>
    </div>
  )
}
