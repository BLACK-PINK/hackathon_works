'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types'
import {
  UserCheck, UserX, Users, Clock,
  Phone, MapPin, Calendar, Briefcase, User,
  Pencil,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatPhone } from '@/lib/utils'

interface MembersPageClientProps {
  profile: any
}

// 직급 목록 — position(화면 표시) + role(DB 권한) 매핑
// role: owner=대표권한, manager=팀장/현장소장 권한, worker=나머지
const POSITION_OPTIONS = [
  { position: '대표',     role: 'owner'   },
  { position: '팀장',     role: 'manager' },
  { position: '현장소장', role: 'manager' },
  { position: '디자이너', role: 'worker'  },
  { position: '기사',     role: 'worker'  },
  { position: '사원',     role: 'worker'  },
  { position: '인턴',     role: 'worker'  },
]

// DB role 값 기준 권한 버튼 (관리자 설정용)
const ROLE_OPTIONS = [
  { value: 'owner',   label: '대표' },
  { value: 'manager', label: '팀장' },
  { value: 'worker',  label: '기사' },
]

const roleColors: Record<string, string> = {
  owner:   'bg-[#FF9500]/10 text-[#FF9500]',
  manager: 'bg-[#007AFF]/10 text-[#007AFF]',
  worker:  'bg-[#34C759]/10 text-[#34C759]',
}

/* ══════════════════════════════════════════════
   메인 페이지
══════════════════════════════════════════════ */
export function MembersPageClient({ profile }: MembersPageClientProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'active' | 'pending'>('active')

  const isOwner = profile.role === 'owner'
  const isManager = profile.role === 'manager'
  const canManage = isOwner || isManager

  // ── 멤버 목록 조회
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members-all', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  // 직급 정렬 순서: 대표 → 현장소장 → 팀장 → 디자이너 → 기사 → 사원 → 인턴 → 미지정
  const POSITION_ORDER: Record<string, number> = {
    '대표': 0, '현장소장': 1, '팀장': 2, '디자이너': 3,
    '기사': 4, '사원': 5, '인턴': 6,
  }
  const sortByPosition = (list: any[]) =>
    [...list].sort((a, b) => {
      const aIdx = POSITION_ORDER[a.position ?? ''] ?? 99
      const bIdx = POSITION_ORDER[b.position ?? ''] ?? 99
      if (aIdx !== bIdx) return aIdx - bIdx
      // 직급 같으면 이름 가나다순
      return (a.name ?? '').localeCompare(b.name ?? '', 'ko')
    })

  const activeMembers  = sortByPosition(members.filter((m: any) => m.is_active))
  const pendingMembers = members.filter((m: any) => !m.is_active)
  const displayList    = tab === 'active' ? activeMembers : pendingMembers

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['members-all', profile.company_id] })
  }

  // ── 승인 (position + role 함께 저장)
  const approveMutation = useMutation({
    mutationFn: async ({ id, role, position }: { id: string; role: string; position: string }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: true, role, position })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('멤버가 승인되었습니다'); refresh(); setExpandedId(null) },
    onError: () => toast.error('승인에 실패했습니다'),
  })

  // ── 직급/역할 변경 (position + role 함께)
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role, position }: { id: string; role: string; position: string }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role, position })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success('직급이 변경되었습니다')
      refresh()
    },
    onError: () => toast.error('직급 변경에 실패했습니다'),
  })

  // ── 개인정보 저장
  const updateInfoMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from('user_profiles').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      toast.success('저장됐습니다')
      refresh()
    },
    onError: () => toast.error('저장에 실패했습니다'),
  })

  // ── 내보내기
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_profiles').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('멤버가 내보내졌습니다'); refresh(); setExpandedId(null) },
    onError: () => toast.error('처리에 실패했습니다'),
  })

  const isPending = approveMutation.isPending || updateRoleMutation.isPending ||
    updateInfoMutation.isPending || deactivateMutation.isPending

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="멤버" />

      {/* 탭 */}
      <div className="bg-white border-b border-black/5 px-4 pt-2 pb-0">
        <div className="flex gap-1">
          {[
            { key: 'active',   icon: <Users className="w-3.5 h-3.5" />,  label: `활성 멤버 (${activeMembers.length})` },
            { key: 'pending',  icon: <Clock className="w-3.5 h-3.5" />,  label: '승인 대기' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={cn(
                'px-3 py-2 text-[13px] font-medium border-b-2 transition-colors flex items-center gap-1.5',
                tab === t.key ? 'text-[#007AFF] border-[#007AFF]' : 'text-[#8E8E93] border-transparent'
              )}
            >
              {t.icon}
              {t.label}
              {t.key === 'pending' && pendingMembers.length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full">
                  {pendingMembers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 초대코드 */}
      {profile.company && (
        <div className="mx-4 mt-3 px-4 py-3 bg-[#007AFF]/8 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#007AFF] font-medium mb-0.5">팀 초대코드</p>
            <p className="text-[18px] font-bold text-[#007AFF] tracking-widest">{profile.company.invite_code}</p>
          </div>
          <p className="text-[11px] text-[#8E8E93] text-right leading-relaxed">
            이 코드로 가입하면<br />승인 대기 목록에 표시됩니다
          </p>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-safe">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="ios-card p-8 text-center mt-2">
            <p className="text-[32px] mb-2">{tab === 'pending' ? '✅' : '👥'}</p>
            <p className="text-[14px] font-medium text-black">
              {tab === 'pending' ? '승인 대기 중인 멤버가 없습니다' : '멤버가 없습니다'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
            {displayList.map((member: any) => (
              <MemberAccordionCard
                key={member.id}
                member={member}
                isMe={member.id === profile.id}
                isOwner={isOwner}
                canManage={canManage}
                onApprove={(role, position) => approveMutation.mutate({ id: member.id, role, position })}
                onChangeRole={(role, position) => updateRoleMutation.mutate({ id: member.id, role, position })}
                onSaveInfo={(patch) => updateInfoMutation.mutate({ id: member.id, patch })}
                onDeactivate={() => deactivateMutation.mutate(member.id)}
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   멤버 아코디언 카드 (클릭 시 인라인 확장)
══════════════════════════════════════════════ */
function MemberAccordionCard({
  member, isMe, isOwner, canManage,
  onApprove, onChangeRole, onSaveInfo, onDeactivate,
  isPending,
}: {
  member: any
  isMe: boolean
  isOwner: boolean
  canManage: boolean
  onApprove: (role: string, position: string) => void
  onChangeRole: (role: string, position: string) => void
  onSaveInfo: (patch: Record<string, any>) => void
  onDeactivate: () => void
  isPending: boolean
}) {
  const [approvePosition, setApprovePosition] = useState('기사')
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const isPendingMember = !member.is_active
  const canAdmin    = isOwner && !isMe
  const canEditInfo = isOwner || isMe
  const isIntern    = member.position === '인턴'

  const startEdit = () => {
    setDraft({
      name:               member.name            || '',
      phone:              member.phone            || '',
      address:            member.address          || '',
      birthday:           member.birthday         || '',
      join_date:          member.join_date        || '',
      position:           member.position         || '',
      intern_start_date:  member.intern_start_date  || '',
      regular_start_date: member.regular_start_date || '',
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = () => {
    const patch: Record<string, any> = {
      name:     draft.name,
      phone:    draft.phone,
      address:  draft.address,
      birthday: draft.birthday || null,
      join_date: draft.join_date || null,
    }
    if (isOwner) {
      const opt = POSITION_OPTIONS.find(o => o.position === draft.position)
      if (opt) {
        patch.position = opt.position
        patch.role     = opt.role
      }
    }
    if (draft.position === '인턴' || member.position === '인턴') {
      patch.intern_start_date  = draft.intern_start_date  || null
      patch.regular_start_date = draft.regular_start_date || null
    }
    onSaveInfo(patch)
    setEditing(false)
  }

  return (
    <div className="ios-card overflow-hidden">
      {/* 항상 펼쳐진 상세 카드 */}
      <div className="bg-[#F9F9FB]">
          {/* 헤더 액션 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 bg-white">
            {editing ? (
              <button onClick={cancelEdit} className="text-[#FF3B30] text-[14px]">취소</button>
            ) : (
              <p className="text-[13px] font-semibold text-black">멤버 정보</p>
            )}
            {canEditInfo && !editing ? (
              <button onClick={startEdit} className="flex items-center gap-1 text-[#007AFF] text-[13px] font-medium">
                <Pencil className="w-3 h-3" /> 수정
              </button>
            ) : canEditInfo && editing ? (
              <button onClick={saveEdit} disabled={isPending} className="text-[#34C759] text-[14px] font-semibold disabled:opacity-40">
                확인
              </button>
            ) : <div />}
          </div>

          {/* 프로필 헤더 */}
          <div className="px-4 py-4 flex items-start gap-3 bg-white min-h-[88px]">
            <div className="w-14 h-14 rounded-full bg-[#007AFF]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[24px] font-bold text-[#007AFF]">{member.name?.charAt(0) || '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] font-bold text-black leading-tight">{member.name}</p>
              {member.position && (
                <p className="text-[12px] text-[#8E8E93] mt-0.5">{member.position}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn(
                  'text-[11px] px-2.5 py-0.5 rounded-full font-medium',
                  isPendingMember ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : roleColors[member.role]
                )}>
                  {isPendingMember ? '승인 대기 중' : ROLE_LABELS[member.role as keyof typeof ROLE_LABELS]}
                </span>
                {isMe && (
                  <span className="text-[11px] px-2 py-0.5 bg-[#8E8E93]/10 text-[#8E8E93] rounded-full">나</span>
                )}
              </div>
            </div>
            {/* 관리자 설정 — 승인 대기: 우측 compact 블록 */}
            {canAdmin && isPendingMember && (
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <select
                  value={approvePosition}
                  onChange={e => setApprovePosition(e.target.value)}
                  className="py-1.5 px-2 rounded-xl bg-[#007AFF]/8 border border-[#007AFF]/30 text-[11px] text-[#007AFF] font-medium outline-none appearance-none cursor-pointer"
                >
                  {POSITION_OPTIONS.map(o => (
                    <option key={o.position} value={o.position}>{o.position}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const opt = POSITION_OPTIONS.find(o => o.position === approvePosition) ?? POSITION_OPTIONS[4]
                    onApprove(opt.role, opt.position)
                  }}
                  disabled={isPending}
                  className="py-1.5 px-2 bg-[#34C759] text-white text-[11px] font-semibold rounded-xl flex items-center justify-center gap-1 active:opacity-80 disabled:opacity-40"
                >
                  <UserCheck className="w-3 h-3" />
                  {isPending ? '처리중' : '승인'}
                </button>
                <button
                  onClick={onDeactivate}
                  disabled={isPending}
                  className="py-1.5 px-2 bg-[#FF3B30]/10 text-[#FF3B30] text-[11px] font-medium rounded-xl active:opacity-80 disabled:opacity-40"
                >
                  거절
                </button>
              </div>
            )}
            {/* 관리자 설정 — 일반 팀원: 직급 select + 내보내기 우측 배치 */}
            {canAdmin && !isPendingMember && (
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <select
                  defaultValue={member.position || '기사'}
                  onChange={e => {
                    const opt = POSITION_OPTIONS.find(o => o.position === e.target.value) ?? POSITION_OPTIONS[4]
                    onChangeRole(opt.role, opt.position)
                  }}
                  disabled={isPending}
                  className="py-1.5 px-2 rounded-xl bg-[#007AFF]/8 border border-[#007AFF]/30 text-[11px] text-[#007AFF] font-medium outline-none appearance-none cursor-pointer disabled:opacity-50"
                >
                  {POSITION_OPTIONS.map(o => (
                    <option key={o.position} value={o.position}>{o.position}</option>
                  ))}
                </select>
                {!confirmDeactivate ? (
                  <button
                    onClick={() => setConfirmDeactivate(true)}
                    className="py-1.5 px-2 bg-[#FF3B30]/8 text-[#FF3B30] text-[11px] font-medium rounded-xl flex items-center justify-center gap-1 active:opacity-80"
                  >
                    <UserX className="w-3 h-3" />
                    내보내기
                  </button>
                ) : (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-[#FF3B30] font-medium text-center">정말요?</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConfirmDeactivate(false)}
                        className="flex-1 py-1.5 bg-[#F2F2F7] text-[#8E8E93] text-[10px] rounded-lg"
                      >취소</button>
                      <button
                        onClick={onDeactivate}
                        disabled={isPending}
                        className="flex-1 py-1.5 bg-[#FF3B30] text-white text-[10px] font-semibold rounded-lg disabled:opacity-40"
                      >{isPending ? '...' : '확인'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 개인 정보 카드 */}
          <div className="mx-4 mb-3 mt-1 rounded-2xl bg-white border border-black/5 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[11px] font-bold text-[#3C3C43] uppercase tracking-wide">개인 정보</p>
            </div>
            <div className="px-4 pb-2">
              {editing ? (
                <div className="space-y-3 py-2">
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <User className="w-3.5 h-3.5" />이름
                    </label>
                    <input
                      value={draft.name}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <Phone className="w-3.5 h-3.5" />전화번호
                    </label>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={e => setDraft(d => ({ ...d, phone: formatPhone(e.target.value) }))}
                      className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3.5 h-3.5" />주소
                    </label>
                    <input
                      value={draft.address}
                      onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
                      className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3.5 h-3.5" />생년월일
                    </label>
                    <input
                      type="date"
                      value={draft.birthday}
                      onChange={e => setDraft(d => ({ ...d, birthday: e.target.value }))}
                      className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <Briefcase className="w-3.5 h-3.5" />입사일 (정규)
                    </label>
                    {isOwner ? (
                      <input
                        type="date"
                        value={draft.join_date}
                        onChange={e => setDraft(d => ({ ...d, join_date: e.target.value }))}
                        className="w-full text-[14px] text-black border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                      />
                    ) : (
                      <p className="text-[13px] text-[#8E8E93] px-1">{draft.join_date || '미입력'} <span className="text-[11px]">(관리자만 변경)</span></p>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                      <Briefcase className="w-3.5 h-3.5" />직급
                    </label>
                    {isOwner ? (
                      <div className="flex flex-wrap gap-1.5">
                        {POSITION_OPTIONS.map(o => (
                          <button
                            key={o.position}
                            type="button"
                            onClick={() => setDraft(d => ({ ...d, position: o.position }))}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-[12px] font-medium transition-all',
                              draft.position === o.position ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#3C3C43]'
                            )}
                          >
                            {o.position}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#8E8E93]">{member.position || '미지정'} <span className="text-[11px]">(관리자만 변경)</span></p>
                    )}
                  </div>
                  {(draft.position === '인턴' || member.position === '인턴') && (
                    <>
                      <div>
                        <label className="text-[11px] text-[#FF9500] font-medium flex items-center gap-1.5 mb-1">
                          <Calendar className="w-3.5 h-3.5" />인턴 시작일
                        </label>
                        <input
                          type="date"
                          value={draft.intern_start_date}
                          onChange={e => setDraft(d => ({ ...d, intern_start_date: e.target.value }))}
                          className="w-full text-[14px] text-black border border-[#FF9500]/30 rounded-xl px-3 py-2 outline-none focus:border-[#FF9500] bg-[#FF9500]/5"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-[#FF9500] font-medium flex items-center gap-1.5 mb-1">
                          <Calendar className="w-3.5 h-3.5" />정규직 전환일
                        </label>
                        <input
                          type="date"
                          value={draft.regular_start_date}
                          onChange={e => setDraft(d => ({ ...d, regular_start_date: e.target.value }))}
                          className="w-full text-[14px] text-black border border-[#FF9500]/30 rounded-xl px-3 py-2 outline-none focus:border-[#FF9500] bg-[#FF9500]/5"
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <InfoRow label="이름"         icon={<User className="w-4 h-4" />}      value={member.name     || ''} />
                  <InfoRow label="전화번호"      icon={<Phone className="w-4 h-4" />}     value={member.phone    || ''} />
                  <InfoRow label="주소"          icon={<MapPin className="w-4 h-4" />}    value={member.address  || ''} />
                  <InfoRow label="생년월일"      icon={<Calendar className="w-4 h-4" />}  value={member.birthday || ''} />
                  <InfoRow label="입사일 (정규)" icon={<Briefcase className="w-4 h-4" />} value={member.join_date || ''} />
                  <InfoRow label="직급"          icon={<Briefcase className="w-4 h-4" />} value={member.position || ''} />
                </>
              )}
            </div>
          </div>

          {/* 인턴 전용 카드 (읽기 모드에서만) */}
          {!editing && isIntern && (
            <div className="mx-4 mb-3 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/20 overflow-hidden">
              <div className="px-4 pt-3 pb-1">
                <p className="text-[11px] font-bold text-[#FF9500] uppercase tracking-wide">인턴 정보</p>
              </div>
              <div className="px-4 pb-2">
                <InfoRow label="인턴 시작일"   icon={<Calendar className="w-4 h-4" />} value={member.intern_start_date  || ''} />
                <InfoRow label="정규직 전환일" icon={<Calendar className="w-4 h-4" />} value={member.regular_start_date || ''} />
              </div>
            </div>
          )}

          {/* 근속 정보 카드 */}
          {member.join_date && (
            <div className="mx-4 mb-3">
              <TenureCard joinDate={member.join_date} />
            </div>
          )}

          {/* 가입일 */}
          <div className="px-4 pb-4 text-center">
            <p className="text-[11px] text-[#C7C7CC]">
              가입일 {member.created_at ? format(new Date(member.created_at), 'yyyy년 M월 d일') : '-'}
            </p>
          </div>
        </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   읽기전용 정보 행 (수정 모드 OFF일 때)
══════════════════════════════════════════════ */
function InfoRow({
  label, icon, value
}: { label: string; icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/5 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[#8E8E93]">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[#8E8E93] font-medium mb-0.5">{label}</p>
        <p className={cn('text-[14px]', value ? 'text-black' : 'text-[#C7C7CC]')}>{value || '미입력'}</p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   근속 정보 카드
══════════════════════════════════════════════ */
function TenureCard({ joinDate }: { joinDate: string }) {
  const start = new Date(joinDate)
  const today = new Date()
  // 날짜 차이 계산 (밀리초 → 일)
  const diffMs = today.getTime() - start.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return null

  const years  = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const remDays = days % 30

  let tenureText = ''
  if (years > 0) tenureText += `${years}년 `
  if (months > 0) tenureText += `${months}개월 `
  tenureText += `${remDays}일`

  return (
    <div className="mx-4 mb-3 rounded-2xl bg-[#34C759]/5 border border-[#34C759]/20 px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#34C759]/10 flex items-center justify-center flex-shrink-0">
        <Briefcase className="w-4 h-4 text-[#34C759]" />
      </div>
      <div>
        <p className="text-[11px] text-[#34C759] font-medium">근속 기간</p>
        <p className="text-[17px] font-bold text-black leading-tight">{tenureText}</p>
        <p className="text-[11px] text-[#8E8E93]">총 {days.toLocaleString()}일 · {format(start, 'yyyy.MM.dd')} 입사</p>
      </div>
    </div>
  )
}
