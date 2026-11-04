# Debrid providers

Shared download and source-selection code uses `src/services/downloads/debridService.js`. It selects the first eligible configured provider in the saved priority order, applies host and torrent preferences, dispatches downloads, and records metadata. `useDebridHosts` loads the enabled providers’ cached domains. Callers do not compare provider IDs or read individual API-key settings.

Each adapter in `src/services/downloads/debrid/` supplies:

- Identity, existing settings keys, downloads-page route, and whether hosted links download directly or process in the cloud.
- Cached supported-host access and URL matching.
- `submitMagnet(link, apiKey, game)` returning `{ id }`, and `resolveHost(link, apiKey)` returning `{ id, status, url }`. A missing URL sends the user to the adapter's downloads page.
- A metadata storage key and serializer for its downloads page. Existing TorBox and Real-Debrid storage formats are preserved.
- An optional setting for explicitly enabled qBittorrent fallback after magnet submission fails.
- Optional `resumePendingTorrents(apiKey)` for providers requiring a separate startup step. It is triggered after submission and polled by `DebridBackgroundTasks` independently of account pages. Real-Debrid uses it to select files once magnet metadata is ready, with persistent pending markers and concurrent-call deduplication.

To add a provider, implement its adapter and register it in `debridProviders`. Add its credentials/settings UI, encrypted setting, API proxy, and account downloads page as needed. Source eligibility, preferred-provider selection, host caching UI, common download controls, and generic queue handling then use the adapter without new provider branches. The unified settings editor and reorderable priority list are generated from the registry.

The generic module accepts an adapter list through `createDebridService` for tests. Tests include a third adapter to exercise expansion through the same public interface, plus both real adapters' normalized results and legacy metadata formats.

Debrid starts disabled (`debridEnabled: false`). The master switch reveals the account editor and enables routing; turning it off retains keys and order and pauses queued debrid downloads. Dragging priority rows or using their arrow buttons saves `debridProviderOrder`. TorBox is first by default when no `debridProviderOrder` has been saved. An explicitly saved order always takes precedence. Hosted links choose the first compatible enabled account; magnets choose the first account with torrent support enabled. API errors do not trigger automatic submissions to another account.

Adapters may expose getTorrentDownload(apiKey, id), returning null while processing or a list of URL, filename, and size records when ready, plus getTorrentGame(entry) to read their stored game metadata. The shared handoff task checks only Ascendara-recorded torrent IDs, waits for local downloads to finish, preserves the selected library, and persists localDownloadStarted after IPC accepts the transfer. The main process validates and caches a grouped file manifest and rejects duplicate/conflicting destinations. The downloader handles the batch through its existing transfer, extraction, verification, and manual-install UI states.
