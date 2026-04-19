import { Skeleton } from "@/components/ui/Skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, year) => (
        <section key={year}>
          <Skeleton className="mb-3 h-4 w-12" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
