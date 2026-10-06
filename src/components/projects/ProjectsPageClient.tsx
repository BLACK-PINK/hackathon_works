'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, ChevronRight, MapPin, Calendar, Phone, Key, DollarSign, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/types'
import { AddProjectSheet } from '@/components/projects/AddProjectSheet'
import { ProjectDetailSheet } from '@/components/projects/ProjectDetailSheet'

interface ProjectsPageClientProps {
  profile: any
}

const statusColors: Record<string, string> = {
  active: 'bg-[#34C759]/10 text-[#34C759]',
  completed: 'bg-[#8E8E93]/10 text-[#8E8E93]',
  paused: 'bg-[#FF9500]/10 text-[#FF9500]',
  cancelled: 'bg-[#FF3B30]/10 text-[#FF3B30]',
}

export function ProjectsPageClient({ profile }: ProjectsPageClientProps) {
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedProject, setSelectedProject] = useState<any | null>(null)
  const supabase = createClient()
  const isOwnerOrManager = profile.role === 'owner' || profile.role === 'manager'

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', profile.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const active = projects.filter((p: any) => p.status === 'active' || p.status === 'paused')
  const completed = projects.filter((p: any) => p.status === 'completed' || p.status === 'cancelled')
  const displayed = tab === 'active' ? active : completed

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="현장"
        action={
          isOwnerOrManager ? (
            <button
              onClick={() => setShowAdd(true)}
              className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center active:opacity-70"
            >
              <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          ) : undefined
        }
      />

      {/* 탭 */}
      <div className="bg-white border-b border-black/5 px-4 pt-2 pb-0">
        <div className="flex">
          {[
            { id: 'active', label: `진행중 (${active.length})` },
            { id: 'completed', label: `종료 (${completed.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'active' | 'completed')}
              className={cn(
                'flex-1 py-2 text-[14px] font-medium border-b-2 transition-colors',
                tab === t.id
                  ? 'text-[#007AFF] border-[#007AFF]'
                  : 'text-[#8E8E93] border-transparent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4 pb-safe">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ios-card p-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="ios-card p-8 text-center mt-4">
            <p className="text-[14px] font-medium text-black">
              {tab === 'active' ? '진행중인 현장이 없습니다' : '종료된 현장이 없습니다'}
            </p>
            {tab === 'active' && isOwnerOrManager && (
              <>
                <p className="text-[13px] text-[#8E8E93] mt-1">+ 버튼으로 현장을 등록해보세요</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-5 py-2 bg-[#007AFF] text-white text-[14px] font-medium rounded-xl active:opacity-70"
                >
                  현장 등록
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {displayed.map((project: any) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => setSelectedProject(project)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 현장 추가 Sheet */}
      <AddProjectSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        profile={profile}
      />

      {/* 현장 상세 Sheet — 모바일에서만 사용 / PC는 카드 인라인 표시 */}
      <ProjectDetailSheet
        project={selectedProject}
        open={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        profile={profile}
      />
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: any; onClick: () => void }) {
  const contractAmount = project.contract_amount
    ? Number(project.contract_amount).toLocaleString() + '원'
    : null

  // 상세 정보 행 렌더러
  const DetailRow = ({ icon, label, value, valueClass }: {
    icon: React.ReactNode; label: string; value: string; valueClass?: string
  }) => (
    <div className="flex items-start gap-3 py-2 border-b border-black/5 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 mt-0.5 text-[#8E8E93]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#8E8E93] font-medium mb-0.5">{label}</p>
        <p className={cn('text-[13px] font-medium', valueClass ?? 'text-black')}>{value}</p>
      </div>
    </div>
  )

  return (
    <div className="ios-card overflow-hidden">
      {/* 커버 이미지 */}
      {project.cover_image_url && (
        <div className="h-32 bg-gray-200 overflow-hidden">
          <img src={project.cover_image_url} alt={project.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* 헤더: 상태 + 제목 + 수정 버튼 */}
      <div className="px-4 pt-4 pb-3 border-b border-black/5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', statusColors[project.status])}>
                {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
              </span>
            </div>
            <h3 className="text-[17px] font-bold text-black leading-snug">{project.name}</h3>
            {project.description && (
              <p className="text-[12px] text-[#8E8E93] mt-0.5 line-clamp-2">{project.description}</p>
            )}
          </div>
          {/* 모바일: 탭해서 상세 Sheet / PC: 수정 아이콘 */}
          <button
            onClick={onClick}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center active:opacity-60 md:flex"
          >
            <Pencil className="w-3.5 h-3.5 text-[#8E8E93]" />
          </button>
        </div>
      </div>

      {/* 상세 정보 — PC에서 항상 표시, 모바일에서도 표시 */}
      <div className="px-4 py-2">
        {project.address && (
          <DetailRow
            icon={<MapPin className="w-3.5 h-3.5" />}
            label="주소"
            value={project.address}
          />
        )}
        {project.client_name && (
          <DetailRow
            icon={<Phone className="w-3.5 h-3.5" />}
            label="고객"
            value={`${project.client_name}${project.client_phone ? `  ${project.client_phone}` : ''}`}
            valueClass="text-[#007AFF] font-medium"
          />
        )}
        {contractAmount && (
          <DetailRow
            icon={<DollarSign className="w-3.5 h-3.5" />}
            label="계약금액"
            value={contractAmount}
            valueClass="text-black font-bold"
          />
        )}
        {(project.access_code || project.unit_password) && (
          <DetailRow
            icon={<Key className="w-3.5 h-3.5" />}
            label="비밀번호"
            value={[
              project.access_code ? `공용 ${project.access_code}` : null,
              project.unit_password ? `세대 ${project.unit_password}` : null,
            ].filter(Boolean).join('  /  ')}
            valueClass="text-[#FF9500] font-semibold"
          />
        )}
        {(project.start_date || project.end_date) && (
          <DetailRow
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="공사 기간"
            value={[project.start_date, project.end_date].filter(Boolean).join(' ~ ')}
          />
        )}
      </div>
    </div>
  )
}
