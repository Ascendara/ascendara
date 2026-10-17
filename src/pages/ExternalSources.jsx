import GameIndexManager from "@/components/GameIndexManager";

// The Ascendara index itself is managed from Settings; this page is only for
// pulling games from external source buckets and imported lists.
export default function ExternalSources() {
  return <GameIndexManager view="sources" />;
}
