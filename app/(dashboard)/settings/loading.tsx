import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>

      <div className="space-y-6">
        {/* Section header */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-full" />
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-border space-y-3">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>

        {/* Config panel */}
        <div className="p-4 rounded-lg border border-border space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-20 rounded" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </div>
    </div>
  )
}
