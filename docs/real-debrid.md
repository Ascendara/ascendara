# Real-Debrid

In **Settings → Downloads**, enable **Debrid services**, select **Real-Debrid**, open **Get an API key**, paste the key, and save it. Ascendara validates the key before saving and stores it with the other encrypted credentials. Clear and save the key to disconnect.

Drag services in **Service priority**, or use the arrow buttons, to choose their order. Hosted links use the first configured, enabled service that supports the URL; magnets use the first with cloud torrents enabled. Turning off the master switch retains the accounts and priority order.

- Hosted links are unrestricted before being passed to the normal downloader. Enable **Prefer Real-Debrid over seamless downloads** to also process seamless hosts through Real-Debrid. Only URLs whose hostname matches Real-Debrid’s supported domain list (including listed aliases and subdomains) are routed through the service. Unsupported URLs keep their normal download flow; temporarily unavailable supported hosts can still return an API error.
- **Use Real-Debrid for torrents** sends magnet links to the cloud without requiring qBittorrent. An app-wide background task selects all files and starts the cloud download as soon as metadata is ready. It continues when you leave the downloads page and resumes pending submissions after restarting Ascendara. Only torrents recorded as added by Ascendara are automatically started.
- Completed torrents submitted through Ascendara automatically continue to your PC, using the library directory selected when submitted. All selected files are transferred together with aggregate progress and pause/resume support. The handoff waits while another local download, extraction, or verification is active and does not restart torrents already handed off. Existing game folders are preserved; a conflicting destination reports an error.
- The normal downloader extracts archives and verifies the output. On Windows, repacks containing a setup installer use the existing **Run installer as Administrator** prompt in **Downloads**; installation still requires the user's interaction with the installer. Linux and macOS debrid downloads extract normally without entering that Windows-only installer flow.
- **Real-Debrid Downloads** shows cloud progress and download history. **View local download / installation** opens the local Downloads page after handoff. Torrents added outside Ascendara retain manual file selection and **Show files → Download to PC** controls.
- The public `/hosts/domains` list is cached in memory and local storage for 24 hours. Expired lists are refreshed with a shared request. If refresh fails, the last valid list is retained and refresh is retried after five minutes. Without a valid list, hosted links are not routed to Real-Debrid.
- Queued hosted links are checked against the cached host list again and unrestricted when the queue starts them, using the current saved API key.

Development and packaged builds proxy requests to the [official Real-Debrid API](https://api.real-debrid.com/). API keys travel in the Authorization header.

Run `npm test` for mocked API contract tests and `npm run build` to verify the production renderer. Live account and download verification requires a Real-Debrid account and suitable test links.
