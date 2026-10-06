'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/PageHeader'
import { Search, X, FileText, MapPin, Wrench, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchPageClientProps {
  profile: any
}

type SearchCategory = 'all' | 'task' | 'order' | 'project' | 'as'

const categories = [
  { id: 'all', label: '전체', icon: '🔍' },
  { id: 'task', label: '업무일지', icon: '📅' },
  { id: 'order', label: '지시', icon: '📌' },
  { id: 'project', label: '현장', icon: '🏗️' },
  { id: 'as', label: 'A/S', icon: '🔧' },
]

export function SearchPageClient({ profile }: SearchPageClientProps) {
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<SearchCategory>('all')
  const [projectFilter, setProjectFilter] = useState('')
  const supabase = createClient()

  const shouldSearch = keyword.trim().length >= 1

  // 현장 목록 (필터용)
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-filter', profile.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .order('name')
      return data || []
    },
  })

  // 통합 검색
  const { data: results, isLoading } = useQuery({
    queryKey: ['search', profile.company_id, keyword, category, projectFilter],
    queryFn: async () => {
      const kw = `%${keyword.trim()}%`
      const companyId = profile.company_id
      const results: any[] = []

      if (category === 'all' || category === 'task') {
        const q = supabase
          .from('daily_tasks')
          .select('id, title, content, date, status, project:projects(name)')
          .eq('company_id', companyId)
          .ilike('title', kw)
        if (projectFilter) q.eq('project_id', projectFilter)
        const { data } = await q.limit(20)
        results.push(...(data || []).map((d) => ({ ...d, _type: 'task' })))
      }

      if (category === 'all' || category === 'order') {
        const q = supabase
          .from('work_orders')
          .select('id, title, content, status, due_date, project:projects(name)')
          .eq('company_id', companyId)
          .ilike('title', kw)
        if (projectFilter) q.eq('project_id', projectFilter)
        const { data } = await q.limit(20)
        results.push(...(data || []).map((d) => ({ ...d, _type: 'order' })))
      }

      if (category === 'all' || category === 'project') {
        const { data } = await supabase
          .from('projects')
          .select('id, name, address, status, client_name')
          .eq('company_id', companyId)
          .or(`name.ilike.${kw},address.ilike.${kw},client_name.ilike.${kw}`)
          .limit(20)
        results.push(...(data || []).map((d) => ({ ...d, _type: 'project' })))
      }

      if (category === 'all' || category === 'as') {
        const q = supabase
          .from('as_records')
          .select('id, content, status, received_date, client_name, project:projects(name)')
          .eq('company_id', companyId)
          .ilike('content', kw)
        if (projectFilter) q.eq('project_id', projectFilter)
        const { data } = await q.limit(20)
        results.push(...(data || []).map((d) => ({ ...d, _type: 'as' })))
      }

      return results
    },
    enabled: shouldSearch,
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="검색" />

      {/* 검색창 */}
      <div className="bg-white px-4 pb-3 pt-2 border-b border-black/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="현장, 일지, 지시, A/S 검색"
            className="w-full bg-[#F2F2F7] rounded-xl pl-9 pr-9 py-2.5 text-[15px] outline-none"
          />
          {keyword && (
            <button
              onClick={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] active:opacity-60"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="bg-white px-4 pb-2 pt-2 border-b border-black/5 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id as SearchCategory)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors',
                category === c.id
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-[#F2F2F7] text-[#8E8E93]'
              )}
            >
              <span>{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 현장 필터 */}
      <div className="bg-white px-4 pb-2 pt-1 border-b border-black/5">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="text-[13px] text-[#8E8E93] bg-transparent outline-none"
        >
          <option value="">현장 전체</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 결과 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-safe">
        {!shouldSearch ? (
          <div className="text-center py-12">
            <p className="text-[40px] mb-3">🔍</p>
            <p className="text-[16px] font-medium text-black">통합 검색</p>
            <p className="text-[14px] text-[#8E8E93] mt-1">
              현장, 업무일지, 업무전달, A/S를 한번에 검색하세요
            </p>
          </div>
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ios-card p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : !results || results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[40px] mb-3">😶</p>
            <p className="text-[16px] font-medium text-black">검색 결과가 없습니다</p>
            <p className="text-[14px] text-[#8E8E93] mt-1">'{keyword}'에 대한 결과가 없어요</p>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-[#8E8E93] font-medium">
              검색결과 {results.length}건
            </p>
            {results.map((item: any) => (
              <SearchResultCard key={`${item._type}-${item.id}`} item={item} keyword={keyword} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function SearchResultCard({ item, keyword }: { item: any; keyword: string }) {
  const typeConfig: Record<string, { label: string; color: string; icon: any }> = {
    task: { label: '업무일지', color: 'bg-[#007AFF]/10 text-[#007AFF]', icon: FileText },
    order: { label: '지시', color: 'bg-[#FF9500]/10 text-[#FF9500]', icon: ClipboardList },
    project: { label: '현장', color: 'bg-[#34C759]/10 text-[#34C759]', icon: MapPin },
    as: { label: 'A/S', color: 'bg-[#FF3B30]/10 text-[#FF3B30]', icon: Wrench },
  }

  const config = typeConfig[item._type]
  const Icon = config.icon

  const highlight = (text: string) => {
    if (!text || !keyword) return text
    const parts = text.split(new RegExp(`(${keyword})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase()
        ? <mark key={i} className="bg-[#FFCC00]/40 text-black rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <div className="ios-card p-4 animate-fade-in-up active:scale-[0.99] transition-transform cursor-pointer">
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', config.color.split(' ')[0])}>
          <Icon className={cn('w-4 h-4', config.color.split(' ')[1])} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', config.color)}>
              {config.label}
            </span>
            {item.project?.name && (
              <span className="text-[11px] text-[#8E8E93]">{item.project.name}</span>
            )}
          </div>
          <p className="text-[14px] font-medium text-black leading-snug">
            {highlight(item.title || item.name || item.content)}
          </p>
          {item.content && item._type !== 'as' && (
            <p className="text-[12px] text-[#8E8E93] mt-0.5 line-clamp-1">
              {item.content}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {item.date && <span className="text-[11px] text-[#C7C7CC]">{item.date}</span>}
            {item.received_date && <span className="text-[11px] text-[#C7C7CC]">{item.received_date}</span>}
            {item.status && (
              <span className="text-[11px] text-[#8E8E93]">{item.status}</span>
            )}
            {item.address && (
              <span className="text-[11px] text-[#8E8E93] truncate">{item.address}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
