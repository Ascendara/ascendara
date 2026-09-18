import AdStats from "@/components/AdStats";

export default function AdStatsSection({ user }) {
  return (
    <div className="mb-24 space-y-6">
      <AdStats userId={user?.uid} />
    </div>
  );
}
