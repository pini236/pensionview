import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="lg:col-span-8 xl:col-span-7">
        <Skeleton className="h-40" />
      </div>
      <div className="lg:col-span-4 xl:col-span-5">
        <Skeleton className="h-40" />
      </div>
      <div className="lg:col-span-8 space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <aside className="lg:col-span-4 space-y-4">
        <Skeleton className="h-44" />
        <Skeleton className="h-32" />
      </aside>
    </div>
  );
}
