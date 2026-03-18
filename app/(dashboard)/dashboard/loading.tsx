import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-12 space-y-16">
        {/* Hero heading skeleton */}
        <div className="text-center space-y-4 pt-8">
          <Skeleton className="h-4 w-40 mx-auto" />
          <Skeleton className="h-12 w-96 mx-auto max-w-full" />
        </div>

        {/* Prompt input skeleton */}
        <div className="max-w-2xl mx-auto">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-7 w-48 rounded-full" />
            ))}
          </div>
        </div>

        {/* Template cards skeleton */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-72 mx-auto mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-xl p-5 space-y-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
