import { Skeleton } from "@/components/ui/skeleton";
import { useLoadHold } from "@/hooks/useLoadHold";
import { Panel } from "./primitives";

// Loading placeholders for each Ascend section, built from the same wrappers,
// spacing and surfaces as the real section so nothing shifts when the content
// replaces them. Each part takes a load hold, so if Ascend is the page the
// app opens on, the startup splash waits for real content (see lib/loadGate).

const range = n => Array.from({ length: n }, (_, i) => i);

function Loading({ className, children }) {
  useLoadHold(true);
  return (
    <div className={className} role="status" aria-label="Loading" aria-busy="true">
      {children}
    </div>
  );
}

// SectionHeader: a text-2xl title, a description line, optional action buttons
function HeaderSkeleton({ actions = [], children }) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        {actions.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {actions.map((width, i) => (
              <Skeleton key={i} className={`h-10 rounded-md ${width}`} />
            ))}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}

// StatStrip: four figures in one rounded strip
export function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border/50 shadow sm:grid-cols-4">
      {range(4).map(i => (
        <div key={i} className="flex items-center gap-3 bg-card/80 px-5 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// A Panel list of people: avatar, name, a line under it
function PeopleRowsSkeleton({ rows = 5, avatar = "h-10 w-10" }) {
  return (
    <Panel as="ul" className="divide-y divide-border/40 overflow-hidden">
      {range(rows).map(i => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className={`shrink-0 rounded-full ${avatar}`} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
        </li>
      ))}
    </Panel>
  );
}

// Game cards with artwork on the left (cloud library, backups)
function GameCardsSkeleton({ rows = 4, art = "h-20 w-36", title = "h-5 w-48" }) {
  return (
    <div className="space-y-3">
      {range(rows).map(i => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl bg-card/60 p-4 shadow"
        >
          <Skeleton className={`shrink-0 rounded-xl ${art}`} />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className={title} />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Section bodies, also shown inside a section while its data loads

export function FriendsSkeleton() {
  return (
    <Loading className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-48 flex-1 rounded-xl" />
        <div className="flex gap-1">
          {range(3).map(i => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <PeopleRowsSkeleton />
      </div>
    </Loading>
  );
}

export function LeaderboardSkeleton() {
  return (
    <Loading className="space-y-6">
      {/* Podium: first place in the middle and raised */}
      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        {[1, 0, 2].map(place => (
          <div
            key={place}
            className={`flex flex-col items-center rounded-2xl p-5 shadow ${
              place === 0 ? "bg-primary/10 sm:py-7" : "bg-card/60"
            }`}
          >
            <Skeleton className="mb-5 h-6 w-10 self-start rounded-full" />
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="mt-3 h-4 w-28" />
            <Skeleton className="mt-2 h-6 w-20 rounded-full" />
            <Skeleton className="mt-4 h-3.5 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="mx-1 h-3 w-24" />
        <div className="overflow-hidden rounded-2xl bg-card/60 shadow">
          {range(6).map(i => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/40 px-4 py-3.5 last:border-b-0 sm:gap-4"
            >
              <Skeleton className="h-4 w-6 shrink-0" />
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function UserProfileSkeleton() {
  return (
    <Loading className="space-y-6">
      <div className="rounded-2xl bg-card/60 p-6 shadow sm:p-8">
        <div className="flex flex-col items-start gap-6 md:flex-row">
          <Skeleton className="h-28 w-28 shrink-0 rounded-3xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <div className="flex flex-wrap gap-3 pt-1">
              {range(3).map(i => (
                <Skeleton key={i} className="h-8 w-24 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <StatStripSkeleton />
      <GameCardsSkeleton rows={3} art="h-14 w-24" title="h-4 w-40" />
    </Loading>
  );
}

export function ConversationListSkeleton({ rows = 7 }) {
  return (
    <Loading className="space-y-1">
      {range(rows).map(i => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

export function NotificationsSkeleton() {
  return (
    <Loading className="space-y-8">
      {[3, 2].map((cards, group) => (
        <section key={group} className="space-y-3">
          <div className="flex min-h-8 items-center">
            <Skeleton className="h-3 w-20" />
          </div>
          {range(cards).map(i => (
            <div key={i} className="rounded-2xl bg-card/60 p-6 shadow">
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-4 w-2/3" />
              <Skeleton className="mt-4 h-3 w-36" />
            </div>
          ))}
        </section>
      ))}
    </Loading>
  );
}

export function UpcomingSkeleton() {
  return (
    <Loading className="space-y-6">
      <div className="rounded-2xl bg-card/60 p-6 shadow sm:p-8">
        <div className="flex items-start gap-5">
          <Skeleton className="mt-1 h-16 w-16 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap gap-3">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-32" />
            </div>
            <Skeleton className="mb-3 h-9 w-2/3" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {range(3).map(i => (
          <div key={i} className="space-y-3 rounded-2xl bg-card/60 p-6 shadow">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function CloudLibraryListSkeleton() {
  return (
    <Loading>
      <GameCardsSkeleton />
    </Loading>
  );
}

export function BackupsListSkeleton() {
  return (
    <Loading>
      <GameCardsSkeleton art="h-14 w-24" title="h-4 w-40" />
    </Loading>
  );
}

export function ReportsListSkeleton() {
  return (
    <Loading>
      <PeopleRowsSkeleton rows={4} />
    </Loading>
  );
}

export function DevicesSkeleton({ rows = 2 }) {
  return (
    <Loading>
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-border/50">
          {range(rows).map(i => (
            <li key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
            </li>
          ))}
        </ul>
      </Panel>
    </Loading>
  );
}

// Whole sections, shown while a section's code loads

const searchBar = (
  <div className="flex flex-wrap gap-3">
    <Skeleton className="h-11 min-w-48 flex-1 rounded-xl" />
    <Skeleton className="h-11 w-28 rounded-xl" />
  </div>
);

const sections = {
  search: () => <div className="mb-20 space-y-6">{searchBar}</div>,

  friends: () => (
    <div className="mb-24 space-y-6">
      <FriendsSkeleton />
    </div>
  ),

  leaderboard: () => (
    <div className="mb-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <LeaderboardSkeleton />
    </div>
  ),

  userProfile: () => (
    <div className="mb-20 space-y-6">
      <Skeleton className="h-9 w-24 rounded-md" />
      <UserProfileSkeleton />
    </div>
  ),

  messages: () => (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col md:pr-6">
        <div className="shrink-0 space-y-5 pb-4">
          <div className="flex items-end justify-between gap-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-none border-b border-border/50 bg-transparent" />
        </div>
        <ConversationListSkeleton />
      </div>
      <div className="hidden min-h-0 md:block" />
    </div>
  ),

  notifications: () => (
    <div className="mb-24 space-y-6">
      <HeaderSkeleton />
      <NotificationsSkeleton />
    </div>
  ),

  reports: () => (
    <div className="mb-24 space-y-6">
      <HeaderSkeleton />
      <ReportsListSkeleton />
    </div>
  ),

  companion: () => (
    <div className="mb-28 space-y-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="flex flex-col p-6 sm:p-8">
          <Skeleton className="h-10 w-3/4 sm:h-11" />
          <Skeleton className="mt-4 h-4 w-full max-w-lg" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-5 flex flex-wrap gap-2">
            {range(4).map(i => (
              <Skeleton key={i} className="h-7 w-28 rounded-full" />
            ))}
          </div>
          <div className="mt-auto pt-8">
            <div className="border-t border-border/50 pt-6">
              <Skeleton className="h-10 w-44 rounded-md" />
            </div>
          </div>
        </Panel>
        <Panel className="flex flex-col items-center p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-48 w-48 rounded-xl" />
          <Skeleton className="mt-5 h-10 w-full rounded-md" />
        </Panel>
      </div>
      <section className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <DevicesSkeleton />
      </section>
    </div>
  ),

  settings: () => (
    <div className="mb-40 space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0">
          <div className="mb-4 hidden items-center gap-3 px-2 lg:flex">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="flex gap-1 overflow-hidden pb-1 lg:flex-col lg:pb-0">
            {range(6).map(i => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-lg lg:w-full" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
          </div>
          {range(2).map(i => (
            <div key={i} className="mt-6 border-t border-border/50 pt-6">
              <Skeleton className="mb-4 h-3 w-28" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),

  cloudlibrary: () => (
    <div className="mb-24 space-y-6">
      <HeaderSkeleton actions={["w-28", "w-32"]}>
        <Skeleton className="h-3 w-56" />
      </HeaderSkeleton>
      <StatStripSkeleton />
      <div className="-mx-2 flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl sm:w-[180px]" />
      </div>
      <CloudLibraryListSkeleton />
    </div>
  ),

  cloudbackups: () => (
    <div className="mb-24 space-y-6">
      <HeaderSkeleton actions={["w-10"]} />
      <Skeleton className="h-11 w-full rounded-xl" />
      <BackupsListSkeleton />
    </div>
  ),

  premium: () => (
    <div className="mb-24 space-y-8">
      <HeaderSkeleton />
      <div className="space-y-4 rounded-2xl bg-card/60 p-5 shadow sm:p-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {range(3).map(i => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {range(3).map(i => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  ),

  discord: () => (
    <div className="mb-40 space-y-6">
      <HeaderSkeleton />
      <Panel className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </Panel>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-36 rounded-md" />
        </Panel>
        <Panel className="space-y-3 p-5">
          <Skeleton className="h-5 w-32" />
          {range(4).map(i => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Panel>
      </div>
    </div>
  ),

  upcoming: () => (
    <div className="mb-24 space-y-6">
      <HeaderSkeleton />
      <UpcomingSkeleton />
    </div>
  ),
};

/**
 * Stands in for an Ascend section while its code loads, laid out like that
 * section. Without a known `section` it shows a generic page outline.
 */
export default function SectionLoading({ section }) {
  const Section = sections[section];
  if (Section) {
    return (
      <Loading className="contents">
        <Section />
      </Loading>
    );
  }
  return (
    <Loading className="mb-24 space-y-6">
      <HeaderSkeleton />
      <StatStripSkeleton />
      <PeopleRowsSkeleton />
    </Loading>
  );
}
