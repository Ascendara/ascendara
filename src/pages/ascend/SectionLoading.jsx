import { Skeleton } from "@/components/ui/skeleton";
import { useLoadHold } from "@/hooks/useLoadHold";

// Stands in for a section while its code loads: the page's outline (title,
// a strip of figures, a list) so the layout is there before the content
export default function SectionLoading() {
  // A section still loading its code keeps the page transition waiting
  useLoadHold(true);
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl bg-card/60 p-4 shadow"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
