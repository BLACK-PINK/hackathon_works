'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: string
  back?: boolean
  backHref?: string
  action?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  back = false,
  backHref,
  action,
  className,
}: PageHeaderProps) {
  const router = useRouter()

  const handleBack = () => {
    if (backHref) router.push(backHref)
    else router.back()
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5',
        className
      )}
    >
      <div className="flex items-center h-[52px] px-4 md:px-6 gap-3">
        {back && (
          <button
            onClick={handleBack}
            className="flex items-center gap-0.5 text-[#007AFF] font-medium text-[15px] -ml-1 active:opacity-60"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold text-black truncate">{title}</h1>
          {subtitle && (
            <p className="text-[12px] text-[#8E8E93] truncate">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </header>
  )
}
