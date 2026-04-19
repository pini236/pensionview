import { Skeleton } from "@/components/ui/Skeleton";

export default function TrendsLoading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="lg:col-span-2 space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-72 lg:h-96" />
      </section>
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-80" />
      </section>
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-80" />
      </section>
    </div>
  );
}
