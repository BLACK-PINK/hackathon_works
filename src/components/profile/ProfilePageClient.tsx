'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types'
import {
  Phone, MapPin, Calendar, Briefcase, User,
  Pencil, LogOut, Copy, Check, Database, ChevronDown, ChevronUp,
} from 'lucide-react'
import { PushNotificationToggle } from '@/components/push/PushNotificationToggle'
import { format } from 'date-fns'
import { formatPhone } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface ProfilePageClientProps {
  profile: any
}

const roleColors: Record<string, string> = {
  owner:   'bg-[#FF9500]/10 text-[#FF9500]',
  manager: 'bg-[#007AFF]/10 text-[#007AFF]',
  worker:  'bg-[#34C759]/10 text-[#34C759]',
}

/* ══════════════════════════════════════════════
   읽기 전용 행
══════════════════════════════════════════════ */
function InfoRow({ label, icon, value }: { label: string; icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-black/5 last:border-0">
      <div className="w-8 h-8 rounded-xl bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[#8E8E93]">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[#8E8E93] font-medium mb-0.5">{label}</p>
        <p className={cn('text-[15px]', value ? 'text-black' : 'text-[#C7C7CC]')}>{value || '미입력'}</p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   근속 기간 카드
══════════════════════════════════════════════ */
function TenureCard({ joinDate }: { joinDate: string }) {
  const start = new Date(joinDate)
  const today = new Date()
  const diffMs = today.getTime() - start.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return null

  const years   = Math.floor(days / 365)
  const months  = Math.floor((days % 365) / 30)
  const remDays = days % 30

  let tenureText = ''
  if (years > 0)  tenureText += `${years}년 `
  if (months > 0) tenureText += `${months}개월 `
  tenureText += `${remDays}일`

  return (
    <div className="mx-4 mb-3 rounded-2xl bg-[#34C759]/5 border border-[#34C759]/20 px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center flex-shrink-0">
        <Briefcase className="w-5 h-5 text-[#34C759]" />
      </div>
      <div>
        <p className="text-[11px] text-[#34C759] font-medium mb-0.5">근속 기간 (정규직 기준)</p>
        <p className="text-[20px] font-bold text-black leading-tight">{tenureText}</p>
        <p className="text-[11px] text-[#8E8E93] mt-0.5">
          총 {days.toLocaleString()}일 · {format(start, 'yyyy.MM.dd')} 입사
        </p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   메인 페이지
══════════════════════════════════════════════ */
export function ProfilePageClient({ profile: initialProfile }: ProfilePageClientProps) {
  const supabase = createClient()
  const router   = useRouter()
  const queryClient = useQueryClient()

  const [profile, setProfile] = useState(initialProfile)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState<Record<string, string>>({})
  const [showLogout, setShowLogout] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showMigrations, setShowMigrations] = useState(false)
  const [taskStats, setTaskStats] = useState<{
    total: number; nullProject: number; withProject: number;
    oldest: string | null; newest: string | null;
  } | null>(null)
  const [taskStatsLoading, setTaskStatsLoading] = useState(false)
  const [taskStatsError, setTaskStatsError] = useState<string | null>(null)

  // owner만 업무일지 데이터 현황 자동 조회
  useEffect(() => {
    if (profile.role !== 'owner') return
    setTaskStatsLoading(true)
    setTaskStatsError(null)
    fetch('/api/recover-tasks')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) {
          setTaskStatsError(d.detail || d.error || `HTTP ${r.status}`)
          return
        }
        if (d.counts) {
          setTaskStats({ ...d.counts, ...d.dateRange })
        } else {
          setTaskStatsError(d.error || '알 수 없는 오류')
        }
      })
      .catch(e => setTaskStatsError(e?.message ?? '네트워크 오류'))
      .finally(() => setTaskStatsLoading(false))
  }, [profile.role])

  // DB 마이그레이션 SQL 목록
  const MIGRATIONS = [
    {
      id: 'migration-26',
      title: '#26 · transactions 부가세 컬럼',
      description: 'supply_amount, vat_amount, vat_type 컬럼 추가 (부가세 분리 추적)',
      sql: `-- 공급가 (부가세 제외 금액)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS supply_amount NUMERIC(15,2) DEFAULT 0;

-- 부가세 금액
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(15,2) DEFAULT 0;

-- 부가세 발행 구분 ('issued' = 발행, 'not_issued' = 미발행)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS vat_type TEXT DEFAULT 'not_issued'
CHECK (vat_type IN ('issued', 'not_issued'));

-- 기존 데이터 마이그레이션: amount → supply_amount 복사
UPDATE transactions
SET supply_amount = amount,
    vat_type = CASE WHEN has_vat THEN 'issued' ELSE 'not_issued' END
WHERE supply_amount = 0;`,
    },
    {
      id: 'migration-27',
      title: '#27 · 현장 삭제 시 연관 데이터 CASCADE',
      description: '현장 삭제 시 원장·A/S·현장일지·일정·업무·발주서 전체 자동 삭제되도록 FK 변경',
      sql: `-- Migration 27: 현장(project) 삭제 시 연관 데이터 전체 CASCADE 삭제
-- 실행 전 반드시 백업 권장

-- 1) transactions
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_project_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 2) as_records
ALTER TABLE as_records
  DROP CONSTRAINT IF EXISTS as_records_project_id_fkey;
ALTER TABLE as_records
  ADD CONSTRAINT as_records_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3) daily_tasks
ALTER TABLE daily_tasks
  DROP CONSTRAINT IF EXISTS daily_tasks_project_id_fkey;
ALTER TABLE daily_tasks
  ADD CONSTRAINT daily_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 4) work_orders
ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_project_id_fkey;
ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 5) schedules
ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_project_id_fkey;
ALTER TABLE schedules
  ADD CONSTRAINT schedules_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 6) cash_flow_schedules
ALTER TABLE cash_flow_schedules
  DROP CONSTRAINT IF EXISTS cash_flow_schedules_project_id_fkey;
ALTER TABLE cash_flow_schedules
  ADD CONSTRAINT cash_flow_schedules_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;`,
    },
    {
      id: 'migration-28-check',
      title: '#28-확인 · 업무일지 데이터 현황 조회',
      description: '삭제된 업무일지 규모 파악 — 실행 후 결과를 확인하세요',
      sql: `-- ① 전체 daily_tasks 수
SELECT COUNT(*) AS total_tasks FROM daily_tasks;

-- ② 최근 작성된 업무일지 10건
SELECT id, date, title, project_id, created_by, created_at
FROM daily_tasks
ORDER BY created_at DESC
LIMIT 10;

-- ③ 날짜별 개수 (최근 3개월)
SELECT date, COUNT(*) AS cnt
FROM daily_tasks
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY date
ORDER BY date DESC;

-- ④ 멤버별 업무일지 수
SELECT up.name, COUNT(dt.id) AS task_count
FROM daily_tasks dt
LEFT JOIN user_profiles up ON up.id = dt.created_by
GROUP BY up.name
ORDER BY task_count DESC;`,
    },
    {
      id: 'migration-28-restore',
      title: '#28-복구 · 업무일지 삭제 재발방지 (daily_tasks 보호)',
      description: '현장 삭제 시 daily_tasks는 project_id만 NULL로 변경 (데이터 보존) — CASCADE에서 SET NULL로 롤백',
      sql: `-- Migration 28: daily_tasks FK를 CASCADE → SET NULL으로 복구
-- (현장 삭제 시 업무일지 자체는 삭제되지 않고 project_id만 NULL이 됨)
-- ⚠️ Migration 27을 실행했다면 반드시 이것도 실행하세요

ALTER TABLE daily_tasks
  DROP CONSTRAINT IF EXISTS daily_tasks_project_id_fkey;
ALTER TABLE daily_tasks
  ADD CONSTRAINT daily_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- 실행 확인
SELECT
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'daily_tasks'
  AND tc.constraint_type = 'FOREIGN KEY';
-- delete_rule이 'SET NULL'이면 정상`,
    },
  ]

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopiedId(id)
      toast.success('SQL이 클립보드에 복사됐습니다')
      setTimeout(() => setCopiedId(null), 2500)
    }).catch(() => toast.error('복사에 실패했습니다'))
  }

  const isIntern = profile.position === '인턴'

  // ── 저장
  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from('user_profiles').update(patch).eq('id', profile.id)
      if (error) throw error
    },
    onSuccess: (_, patch) => {
      toast.success('저장됐습니다')
      setProfile((prev: any) => ({ ...prev, ...patch }))
      queryClient.invalidateQueries({ queryKey: ['members-all'] })
    },
    onError: () => toast.error('저장에 실패했습니다'),
  })

  const startEdit = () => {
    setDraft({
      name:               profile.name               || '',
      phone:              profile.phone              || '',
      address:            profile.address            || '',
      birthday:           profile.birthday           || '',
      join_date:          profile.join_date          || '',
      intern_start_date:  profile.intern_start_date  || '',
      regular_start_date: profile.regular_start_date || '',
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const saveEdit = () => {
    const patch: Record<string, any> = {
      name:      draft.name,
      phone:     draft.phone,
      address:   draft.address,
      birthday:  draft.birthday  || null,
      join_date: draft.join_date || null,
    }
    if (isIntern) {
      patch.intern_start_date  = draft.intern_start_date  || null
      patch.regular_start_date = draft.regular_start_date || null
    }
    updateMutation.mutate(patch)
    setEditing(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      {/* ── 헤더: 닫기(취소) / 제목 / 수정(확인) */}
      <div className="bg-white border-b border-black/5 flex-shrink-0">
        <div className="flex items-center justify-between px-5 py-3">
          {editing ? (
            <button onClick={cancelEdit} className="text-[#FF3B30] text-[16px]">취소</button>
          ) : (
            <div className="w-10" />
          )}
          <p className="text-[17px] font-semibold text-black">마이페이지</p>
          {editing ? (
            <button
              onClick={saveEdit}
              disabled={updateMutation.isPending}
              className="text-[#34C759] text-[16px] font-semibold disabled:opacity-40"
            >
              확인
            </button>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-[#007AFF] text-[15px] font-medium"
            >
              <Pencil className="w-3.5 h-3.5" />
              수정
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-safe pb-8">
        {/* PC: 중앙 정렬 + 최대 너비 제한으로 가독성 개선 */}
        <div className="max-w-xl mx-auto w-full">
        {/* ── 프로필 헤더 */}
        <div className="mx-4 mt-4 mb-3 rounded-2xl bg-white border border-black/5 shadow-sm px-5 py-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#007AFF]/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[28px] font-bold text-[#007AFF]">
              {profile.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[22px] font-bold text-black leading-tight">{profile.name}</p>
            {profile.position && (
              <p className="text-[13px] text-[#8E8E93] mt-0.5">{profile.position}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn(
                'text-[11px] px-2.5 py-0.5 rounded-full font-medium',
                roleColors[profile.role] ?? 'bg-gray-100 text-gray-500'
              )}>
                {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? profile.role}
              </span>
              {profile.company?.name && (
                <span className="text-[11px] text-[#8E8E93]">{profile.company.name}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── 근속 기간 */}
        {profile.join_date && <TenureCard joinDate={profile.join_date} />}

        {/* ── 내 정보 카드 */}
        <div className="mx-4 mb-3 rounded-2xl bg-white border border-black/5 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[12px] font-bold text-[#3C3C43] uppercase tracking-wide">내 정보</p>
            {!editing && (
              <p className="text-[11px] text-[#8E8E93] mt-0.5">우측 상단 수정 버튼으로 편집하세요</p>
            )}
          </div>
          <div className="px-4 pb-2">
            {editing ? (
              /* ── 수정 폼 */
              <div className="space-y-3 py-2">
                {/* 이름 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <User className="w-3.5 h-3.5" />이름
                  </label>
                  <input
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                  />
                </div>
                {/* 전화번호 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <Phone className="w-3.5 h-3.5" />전화번호
                  </label>
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={e => setDraft(d => ({ ...d, phone: formatPhone(e.target.value) }))}
                    className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                  />
                </div>
                {/* 주소 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3.5 h-3.5" />주소
                  </label>
                  <input
                    value={draft.address}
                    onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
                    className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                  />
                </div>
                {/* 생년월일 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5" />생년월일
                  </label>
                  <input
                    type="date"
                    value={draft.birthday}
                    onChange={e => setDraft(d => ({ ...d, birthday: e.target.value }))}
                    className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                  />
                </div>
                {/* 입사일 — owner(대표)는 직접 수정 가능, 나머지는 읽기 전용 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <Briefcase className="w-3.5 h-3.5" />입사일 (정규)
                  </label>
                  {profile.role === 'owner' ? (
                    <input
                      type="date"
                      value={draft.join_date}
                      onChange={e => setDraft(d => ({ ...d, join_date: e.target.value }))}
                      className="w-full text-[15px] text-black border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-[#007AFF] bg-[#F2F2F7]"
                    />
                  ) : (
                    <p className="text-[14px] text-[#8E8E93] px-1">
                      {draft.join_date || '미입력'} <span className="text-[12px]">(관리자만 변경 가능)</span>
                    </p>
                  )}
                </div>
                {/* 직급 — 읽기 전용 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] font-medium flex items-center gap-1.5 mb-1">
                    <Briefcase className="w-3.5 h-3.5" />직급
                  </label>
                  <p className="text-[14px] text-[#8E8E93] px-1">
                    {profile.position || '미지정'} <span className="text-[12px]">(관리자만 변경 가능)</span>
                  </p>
                </div>
                {/* 인턴 전용 */}
                {isIntern && (
                  <>
                    <div>
                      <label className="text-[11px] text-[#FF9500] font-medium flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3.5 h-3.5" />인턴 시작일
                      </label>
                      <input
                        type="date"
                        value={draft.intern_start_date}
                        onChange={e => setDraft(d => ({ ...d, intern_start_date: e.target.value }))}
                        className="w-full text-[15px] text-black border border-[#FF9500]/30 rounded-xl px-3 py-2.5 outline-none focus:border-[#FF9500] bg-[#FF9500]/5"
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
                        className="w-full text-[15px] text-black border border-[#FF9500]/30 rounded-xl px-3 py-2.5 outline-none focus:border-[#FF9500] bg-[#FF9500]/5"
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── 읽기 모드 */
              <>
                <InfoRow label="이름"       icon={<User className="w-4 h-4" />}     value={profile.name     || ''} />
                <InfoRow label="전화번호"   icon={<Phone className="w-4 h-4" />}    value={profile.phone    || ''} />
                <InfoRow label="주소"       icon={<MapPin className="w-4 h-4" />}   value={profile.address  || ''} />
                <InfoRow label="생년월일"   icon={<Calendar className="w-4 h-4" />} value={profile.birthday || ''} />
                <InfoRow label="입사일 (정규)" icon={<Briefcase className="w-4 h-4" />} value={profile.join_date || ''} />
                {/* 직급 읽기 전용 */}
                <div className="flex items-start gap-3 py-3">
                  <div className="w-8 h-8 rounded-xl bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Briefcase className="w-4 h-4 text-[#8E8E93]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#8E8E93] font-medium mb-0.5">직급</p>
                    <div className="flex items-center gap-2">
                      <p className={cn('text-[15px] flex-1', profile.position ? 'text-black' : 'text-[#C7C7CC]')}>
                        {profile.position || '미지정'}
                      </p>
                      <span className="text-[11px] text-[#C7C7CC]">관리자만 변경</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 인턴 전용 카드 (읽기 모드) */}
        {!editing && isIntern && (
          <div className="mx-4 mb-3 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/20 overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <p className="text-[12px] font-bold text-[#FF9500] uppercase tracking-wide">인턴 정보</p>
            </div>
            <div className="px-4 pb-2">
              <InfoRow label="인턴 시작일"   icon={<Calendar className="w-4 h-4" />} value={profile.intern_start_date  || ''} />
              <InfoRow label="정규직 전환일" icon={<Calendar className="w-4 h-4" />} value={profile.regular_start_date || ''} />
            </div>
          </div>
        )}

        {/* ── 계정 정보 */}
        <div className="mx-4 mb-3 rounded-2xl bg-white border border-black/5 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[12px] font-bold text-[#3C3C43] uppercase tracking-wide">계정</p>
          </div>
          <div className="px-4 pb-3 space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-black/5">
              <span className="text-[13px] text-[#8E8E93]">팀</span>
              <span className="text-[13px] font-medium text-black">{profile.company?.name || '-'}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[13px] text-[#8E8E93]">가입일</span>
              <span className="text-[13px] text-black">
                {profile.created_at ? format(new Date(profile.created_at), 'yyyy년 M월 d일') : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* ── 푸시 알림 설정 */}
        <div className="mx-4 mb-3 rounded-2xl bg-white border border-black/5 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[12px] font-bold text-[#3C3C43] uppercase tracking-wide">알림 설정</p>
          </div>
          <div className="px-4 pb-3">
            <PushNotificationToggle />
          </div>
        </div>

        {/* ── 업무일지 데이터 현황 (owner 전용) */}
        {profile.role === 'owner' && (
          <div className="mx-4 mb-3">
            <div className={cn(
              'rounded-2xl border overflow-hidden',
              taskStats?.total === 0
                ? 'bg-[#FF3B30]/5 border-[#FF3B30]/30'
                : taskStatsError
                  ? 'bg-[#FF9500]/5 border-[#FF9500]/30'
                  : 'bg-white border-black/5'
            )}>
              <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                  taskStats?.total === 0 ? 'bg-[#FF3B30]/10'
                  : taskStatsError ? 'bg-[#FF9500]/10'
                  : 'bg-[#34C759]/10'
                )}>
                  <Database className={cn(
                    'w-4 h-4',
                    taskStats?.total === 0 ? 'text-[#FF3B30]'
                    : taskStatsError ? 'text-[#FF9500]'
                    : 'text-[#34C759]'
                  )} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#1C1C1E]">업무일지 데이터 현황</p>
                  <p className="text-[11px] text-[#8E8E93]">DB 실제 저장 건수</p>
                </div>
              </div>
              <div className="px-4 pb-3">
                {taskStatsLoading ? (
                  <p className="text-[13px] text-[#8E8E93]">조회 중...</p>
                ) : taskStatsError ? (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-semibold text-[#FF9500]">⚠️ 조회 오류</p>
                    <p className="text-[11px] text-[#FF9500]/80 font-mono break-all">{taskStatsError}</p>
                    <p className="text-[11px] text-[#8E8E93] mt-1">
                      아래 DB 마이그레이션 섹션의 <strong>#28-확인</strong> SQL을 Supabase SQL Editor에서 직접 실행하세요.
                    </p>
                  </div>
                ) : taskStats ? (
                  taskStats.total === 0 ? (
                    <div className="space-y-2">
                      <p className="text-[14px] font-bold text-[#FF3B30]">⚠️ 업무일지 데이터 없음</p>
                      <p className="text-[12px] text-[#FF3B30]/80">
                        고아 데이터 정리 SQL 실행 시 project_id가 없는 업무일지 전체가 삭제된 것으로 추정됩니다.
                      </p>
                      <p className="text-[12px] text-[#8E8E93] mt-1">
                        👇 아래 DB 마이그레이션 섹션에서<br/>
                        <strong>#28-확인</strong> SQL로 현황 파악 후<br/>
                        Supabase Dashboard → Backups에서 복구하세요.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#8E8E93]">전체</span>
                        <span className="text-[14px] font-bold text-[#1C1C1E]">{taskStats.total.toLocaleString()}건</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#8E8E93]">현장 연결</span>
                        <span className="text-[13px] text-[#007AFF]">{taskStats.withProject.toLocaleString()}건</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#8E8E93]">현장 미연결 (개인)</span>
                        <span className="text-[13px] text-[#8E8E93]">{taskStats.nullProject.toLocaleString()}건</span>
                      </div>
                      {taskStats.oldest && (
                        <div className="flex items-center justify-between border-t border-black/5 pt-1.5 mt-1.5">
                          <span className="text-[11px] text-[#C7C7CC]">최초 작성일</span>
                          <span className="text-[11px] text-[#C7C7CC]">{taskStats.oldest}</span>
                        </div>
                      )}
                      {taskStats.newest && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#C7C7CC]">최근 작성일</span>
                          <span className="text-[11px] text-[#C7C7CC]">{taskStats.newest}</span>
                        </div>
                      )}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ── DB 마이그레이션 (owner 전용) */}
        {profile.role === 'owner' && (
          <div className="mx-4 mb-4">
            <button
              onClick={() => setShowMigrations(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white border border-black/5 active:opacity-70"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#5856D6]/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-[#5856D6]" />
                </div>
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-[#3C3C43]">DB 마이그레이션 SQL</p>
                  <p className="text-[11px] text-[#8E8E93]">Supabase SQL Editor에서 실행</p>
                </div>
              </div>
              {showMigrations
                ? <ChevronUp className="w-4 h-4 text-[#8E8E93]" />
                : <ChevronDown className="w-4 h-4 text-[#8E8E93]" />
              }
            </button>

            {showMigrations && (
              <div className="mt-2 space-y-2">
                {/* 안내 배너 */}
                <div className="px-4 py-3 bg-[#5856D6]/8 rounded-xl">
                  <p className="text-[12px] text-[#5856D6] font-medium">
                    📋 복사 후 Supabase Dashboard → SQL Editor에 붙여넣기 후 실행하세요
                  </p>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#5856D6]/70 underline mt-0.5 block"
                  >
                    supabase.com/dashboard 열기 →
                  </a>
                </div>

                {MIGRATIONS.map((m) => {
                  const isRecovery = m.id.startsWith('migration-28')
                  return (
                  <div key={m.id} className={cn(
                    'rounded-2xl overflow-hidden',
                    isRecovery
                      ? 'bg-[#FF3B30]/5 border border-[#FF3B30]/30'
                      : 'bg-white border border-black/5'
                  )}>
                    {/* 복구 전용 상단 배너 */}
                    {isRecovery && (
                      <div className="px-4 py-2 bg-[#FF3B30]/10 border-b border-[#FF3B30]/20">
                        <p className="text-[11px] font-bold text-[#FF3B30]">🚨 업무일지 복구 관련</p>
                      </div>
                    )}
                    {/* 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
                      <div>
                        <p className={cn('text-[13px] font-semibold', isRecovery ? 'text-[#FF3B30]' : 'text-[#1C1C1E]')}>{m.title}</p>
                        <p className="text-[11px] text-[#8E8E93] mt-0.5">{m.description}</p>
                      </div>
                      <button
                        onClick={() => handleCopySql(m.id, m.sql)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all flex-shrink-0 ml-3',
                          copiedId === m.id
                            ? 'bg-[#34C759] text-white'
                            : isRecovery
                              ? 'bg-[#FF3B30] text-white active:opacity-70'
                              : 'bg-[#5856D6] text-white active:opacity-70'
                        )}
                      >
                        {copiedId === m.id
                          ? <><Check className="w-3.5 h-3.5" /> 복사됨</>
                          : <><Copy className="w-3.5 h-3.5" /> SQL 복사</>
                        }
                      </button>
                    </div>
                    {/* SQL 미리보기 */}
                    <div className="px-4 py-3 bg-[#1C1C1E]">
                      <pre className="text-[10px] text-[#98989E] leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">
                        {m.sql}
                      </pre>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 로그아웃 */}
        <div className="mx-4 mb-6">
          {!showLogout ? (
            <button
              onClick={() => setShowLogout(true)}
              className="w-full py-3.5 rounded-2xl bg-white border border-black/5 text-[#FF3B30] text-[15px] font-medium flex items-center justify-center gap-2 active:opacity-70"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          ) : (
            <div className="rounded-2xl bg-[#FF3B30]/5 border border-[#FF3B30]/20 p-4 space-y-3">
              <p className="text-[14px] text-[#FF3B30] font-medium text-center">정말 로그아웃 하시겠습니까?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLogout(false)}
                  className="flex-1 py-2.5 bg-white text-[#8E8E93] text-[14px] rounded-xl"
                >
                  취소
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 bg-[#FF3B30] text-white text-[14px] font-semibold rounded-xl"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
        </div>{/* max-w-xl 닫기 */}
      </div>
    </div>
  )
}
