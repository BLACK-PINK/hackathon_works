'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Building2, Users, Loader2, ChevronRight } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

type Step = 'choice' | 'create-company' | 'join-company' | 'set-role'

const createCompanySchema = z.object({
  companyName: z.string().min(2, '회사명은 2자 이상이어야 합니다'),
  businessNumber: z.string().optional(),
  phone: z.string().optional(),
})
const joinCompanySchema = z.object({
  inviteCode: z.string().min(6, '초대코드를 입력해주세요').max(6, '초대코드는 6자리입니다'),
})
const roleSchema = z.object({
  role: z.enum(['owner', 'manager', 'worker']),
  name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  phone: z.string().optional(),
})

type CreateCompanyForm = z.infer<typeof createCompanySchema>
type JoinCompanyForm = z.infer<typeof joinCompanySchema>
type RoleForm = z.infer<typeof roleSchema>

export function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('choice')
  const [loading, setLoading] = useState(false)
  const [foundCompany, setFoundCompany] = useState<any>(null)
  const [pendingData, setPendingData] = useState<any>(null)

  const createForm = useForm<CreateCompanyForm>({ resolver: zodResolver(createCompanySchema) })
  const joinForm = useForm<JoinCompanyForm>({ resolver: zodResolver(joinCompanySchema) })
  const roleForm = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: 'worker', name: '', phone: '' },
  })

  const handleCreateCompany = (data: CreateCompanyForm) => {
    setPendingData({ type: 'create', ...data })
    setStep('set-role')
  }

  const handleFindCompany = async (data: JoinCompanyForm) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: company, error } = await supabase
        .from('companies')
        .select('id, name, invite_code')
        .eq('invite_code', data.inviteCode.toUpperCase())
        .single()
      if (error || !company) { toast.error('유효하지 않은 초대코드입니다'); return }
      setFoundCompany(company)
      setPendingData({ type: 'join', companyId: company.id })
      setStep('set-role')
    } catch { toast.error('오류가 발생했습니다') }
    finally { setLoading(false) }
  }

  const handleComplete = async (data: RoleForm) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { toast.error('로그인이 필요합니다'); router.push('/login'); return }

      if (pendingData?.type === 'create') {
        const { data: company, error: companyError } = await supabase
          .from('companies').insert({
            name: pendingData.companyName,
            business_number: pendingData.businessNumber || null,
            phone: pendingData.phone || null,
            owner_id: user.id,
          }).select().single()
        if (companyError || !company) { toast.error('회사 생성에 실패했습니다'); return }
        await supabase.from('user_profiles').upsert({
          id: user.id, company_id: company.id,
          name: data.name, phone: data.phone || null, role: 'owner',
        })
        await supabase.from('cash_accounts').insert({
          company_id: company.id, user_id: user.id,
          name: `${data.name} 시재`, initial_balance: 0, current_balance: 0,
        })
        toast.success('회사가 생성되었습니다! 🎉')
      } else if (pendingData?.type === 'join') {
        await supabase.from('user_profiles').upsert({
          id: user.id, company_id: pendingData.companyId,
          name: data.name, phone: data.phone || null, role: data.role,
          is_active: false,  // 관리자 승인 대기 상태
        })
        await supabase.from('cash_accounts').insert({
          company_id: pendingData.companyId, user_id: user.id,
          name: `${data.name} 시재`, initial_balance: 0, current_balance: 0,
        })
        toast.success(`${foundCompany?.name}에 참여 신청이 완료되었습니다! 관리자 승인 후 이용할 수 있습니다 ✅`)
      }
      router.push('/journal/task'); router.refresh()
    } catch { toast.error('오류가 발생했습니다') }
    finally { setLoading(false) }
  }

  if (step === 'choice') return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-[#007AFF] rounded-[22px] mx-auto mb-4 flex items-center justify-center shadow-lg">
          <span className="text-4xl">🏗️</span>
        </div>
        <h1 className="text-[24px] font-bold text-black">시작하기</h1>
        <p className="text-[14px] text-[#8E8E93] mt-1">새 회사를 만들거나 기존 회사에 참여하세요</p>
      </div>
      <div className="space-y-3">
        <button onClick={() => setStep('create-company')}
          className="ios-card w-full p-5 flex items-center gap-4 active:scale-[0.98] transition-transform">
          <div className="w-12 h-12 bg-[#007AFF]/10 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-[#007AFF]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[16px] font-semibold text-black">새 회사 만들기</p>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">회사를 새로 등록하고 팀원을 초대하세요</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#C7C7CC]" />
        </button>
        <button onClick={() => setStep('join-company')}
          className="ios-card w-full p-5 flex items-center gap-4 active:scale-[0.98] transition-transform">
          <div className="w-12 h-12 bg-[#34C759]/10 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-[#34C759]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[16px] font-semibold text-black">초대코드로 참여</p>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">초대코드를 입력해 기존 회사에 참여하세요</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#C7C7CC]" />
        </button>
      </div>
    </div>
  )

  if (step === 'create-company') return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-black">회사 등록</h1>
        <p className="text-[14px] text-[#8E8E93] mt-1">회사 정보를 입력해주세요</p>
      </div>
      <form onSubmit={createForm.handleSubmit(handleCreateCompany)} className="space-y-3">
        <div className="ios-card p-4 space-y-3">
          <div>
            <input {...createForm.register('companyName')} type="text" placeholder="회사명 *" className="ios-input" />
            {createForm.formState.errors.companyName && (
              <p className="text-[#FF3B30] text-xs mt-1 px-1">{createForm.formState.errors.companyName.message}</p>
            )}
          </div>
          <div className="ios-divider" />
          <input {...createForm.register('businessNumber')} type="text" placeholder="사업자등록번호 (선택)" className="ios-input" />
          <div className="ios-divider" />
          <input
            {...createForm.register('phone')}
            type="tel"
            placeholder="회사 연락처 (선택)"
            className="ios-input"
            onChange={(e) => {
              const formatted = formatPhone(e.target.value)
              e.target.value = formatted
              createForm.setValue('phone', formatted)
            }}
          />
        </div>
        <button type="submit" className="ios-btn-primary flex items-center justify-center">다음</button>
        <button type="button" onClick={() => setStep('choice')} className="w-full h-12 text-[#8E8E93] text-[15px]">이전으로</button>
      </form>
    </div>
  )

  if (step === 'join-company') return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-black">초대코드 입력</h1>
        <p className="text-[14px] text-[#8E8E93] mt-1">대표님께 초대코드를 받아 입력하세요</p>
      </div>
      <form onSubmit={joinForm.handleSubmit(handleFindCompany)} className="space-y-3">
        <div className="ios-card p-4">
          <input {...joinForm.register('inviteCode')} type="text" placeholder="초대코드 6자리"
            maxLength={6} className="ios-input text-center text-[20px] font-bold tracking-widest uppercase" />
          {joinForm.formState.errors.inviteCode && (
            <p className="text-[#FF3B30] text-xs mt-1 px-1 text-center">{joinForm.formState.errors.inviteCode.message}</p>
          )}
        </div>
        <button type="submit" disabled={loading} className="ios-btn-primary flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '확인'}
        </button>
        <button type="button" onClick={() => setStep('choice')} className="w-full h-12 text-[#8E8E93] text-[15px]">이전으로</button>
      </form>
    </div>
  )

  if (step === 'set-role') {
    const isCreating = pendingData?.type === 'create'
    const roles = [
      { value: 'manager', label: '팀장/디자이너', desc: '현장 등록, 업무전달 가능' },
      { value: 'worker', label: '현장기사', desc: '일지 작성, 지시 확인 가능' },
    ]
    return (
      <div className="space-y-6">
        <div className="text-center">
          {foundCompany && <p className="text-[#007AFF] text-[14px] font-medium mb-2">📍 {foundCompany.name}</p>}
          {isCreating && <p className="text-[#007AFF] text-[14px] font-medium mb-2">🏢 {pendingData.companyName}</p>}
          <h1 className="text-[22px] font-bold text-black">내 정보 설정</h1>
          <p className="text-[14px] text-[#8E8E93] mt-1">이름과 역할을 설정해주세요</p>
        </div>
        <form onSubmit={roleForm.handleSubmit(handleComplete)} className="space-y-3">
          <div className="ios-card p-4 space-y-3">
            <div>
              <input {...roleForm.register('name')} type="text" placeholder="이름 *" className="ios-input" />
              {roleForm.formState.errors.name && (
                <p className="text-[#FF3B30] text-xs mt-1 px-1">{roleForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="ios-divider" />
            <input
            {...roleForm.register('phone')}
            type="tel"
            placeholder="연락처 (선택)"
            className="ios-input"
            onChange={(e) => {
              const formatted = formatPhone(e.target.value)
              e.target.value = formatted
              roleForm.setValue('phone', formatted)
            }}
          />
          </div>
          {!isCreating && (
            <div className="ios-card p-4 space-y-2">
              <p className="text-[13px] font-medium text-[#8E8E93] px-1 mb-2">역할 선택</p>
              {roles.map((r) => (
                <label key={r.value} className="flex items-center gap-3 p-2 cursor-pointer">
                  <input {...roleForm.register('role')} type="radio" value={r.value} className="w-5 h-5 accent-[#007AFF]" />
                  <div>
                    <p className="text-[15px] font-medium text-black">{r.label}</p>
                    <p className="text-[12px] text-[#8E8E93]">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <button type="submit" disabled={loading} className="ios-btn-primary flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isCreating ? '회사 만들기 🎉' : '참여하기 🎉')}
          </button>
        </form>
      </div>
    )
  }
  return null
}
