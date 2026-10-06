'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Calendar, Wand2, LayoutGrid } from 'lucide-react'
import { SchedulerPageClient } from './SchedulerPageClient'
import { AutoSchedulerClient } from './AutoSchedulerClient'
import { SiteScheduleCalendar } from './SiteScheduleCalendar'

interface Props { profile: any }

type Tab = 'scheduler' | 'auto' | 'site'

export function SchedulerTabs({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('scheduler')

  // scheduler/auto 탭: h-dvh 기준 고정 높이 + 내부 스크롤
  // site 탭: 자연 흐름 — main(layout)의 overflow-y-auto 가 스크롤 담당
  if (tab === 'site') {
    return (
      <div className="flex flex-col min-h-full bg-[#F2F2F7]">
        {/* 탭 바 — sticky 로 스크롤해도 항상 상단 고정 */}
        <div className="bg-white border-b border-black/5 flex-shrink-0 px-2 pt-2 pb-0 sticky top-0 z-10">
          <div className="flex gap-0">
            <TabBtn active={false} onClick={() => setTab('scheduler')} icon={<Calendar className="w-4 h-4" />} label="스케줄러" />
            <TabBtn active={false} onClick={() => setTab('auto')}      icon={<Wand2 className="w-4 h-4" />}    label="자동 생성" />
            <TabBtn active={true}  onClick={() => setTab('site')}      icon={<LayoutGrid className="w-4 h-4" />} label="현장별" />
          </div>
        </div>
        {/* site 콘텐츠: 자연 흔름으로 얼마든지 늘어남 */}
        <SiteScheduleCalendar profile={profile} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      {/* 탭 바 */}
      <div className="bg-white border-b border-black/5 flex-shrink-0 px-2 pt-2 pb-0">
        <div className="flex gap-0">
          <TabBtn
            active={tab === 'scheduler'}
            onClick={() => setTab('scheduler')}
            icon={<Calendar className="w-4 h-4" />}
            label="스케줄러"
          />
          <TabBtn
            active={tab === 'auto'}
            onClick={() => setTab('auto')}
            icon={<Wand2 className="w-4 h-4" />}
            label="자동 생성"
          />
          <TabBtn
            active={tab === 'site'}
            onClick={() => setTab('site')}
            icon={<LayoutGrid className="w-4 h-4" />}
            label="현장별"
          />
        </div>
      </div>

      {/* scheduler/auto: 고정 높이 + 내부 스크롤 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'scheduler' && <SchedulerPageClient profile={profile} />}
        {tab === 'auto'      && <AutoSchedulerClient  profile={profile} />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void
  icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap',
        active
          ? 'text-[#007AFF] border-[#007AFF]'
          : 'text-[#8E8E93] border-transparent'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
