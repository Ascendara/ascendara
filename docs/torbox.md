# TorBox routing

Enable **Debrid services** in **Settings → Downloads**, select **TorBox**, and save your API key. Drag services in the priority list or use the arrow buttons to choose their order. Routing uses the first configured, enabled service that supports the link. The master switch retains your accounts and order when turned off.

Hosted URLs are matched against the domains and aliases returned by TorBox's public [`/webdl/hosters` endpoint](https://api-docs.torbox.app/). Exact hostnames and subdomains match; provider display names and a fixed host list are no longer used for routing. Unsupported URLs keep their normal download flow.

By default, GoFile, PixelDrain and Buzzheavier keep their normal download flow. **Prioritize TorBox Over Seamless** enables TorBox for those providers too, provided their actual URL is in the supported list.

The host list is cached in memory and local storage for 24 hours, using a separate cache key from Real-Debrid. Concurrent callers share one refresh request. Failed refreshes retain the last valid list and retry after five minutes. Without a valid list, hosted links are not routed to TorBox.

TorBox submissions check the cached list again before creating a web download. Supported hosts can still be temporarily unavailable; the download API reports those failures. Temporary status is not treated as a permanent lack of support or cached as an offline block for 24 hours.

TorBox processes hosted links in its cloud first, even when a local download is already active. The TorBox Downloads page handles the subsequent download to your PC.

Torrents submitted through Ascendara now continue automatically to your PC after cloud completion. The shared debrid handoff requests a fresh ZIP link, waits for other local transfers, and passes it to the normal downloader for extraction and any required installer prompt. Hosted web downloads retain their existing manual Download to PC control.
