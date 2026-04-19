import { Skeleton } from "@/components/ui/Skeleton";

export default function ReportDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-10 w-72" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
