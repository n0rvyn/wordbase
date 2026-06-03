---
name: wb-apps-sync
description: Sync WordBase app entries from App Store Connect and show the result. Use when the user wants to refresh app metadata, pull the latest App Store data, or says "sync my apps".
---

# WordBase apps sync

Refresh the App Store data backing the WordBase apps section via the `wordbase` MCP server.

1. Call `app_sync_all` to pull the latest App Store Connect data for all tracked apps.
2. Call `app_list` to show the resulting app entries (name, version, last-synced).
3. Summarize what changed: which apps synced, any that errored.

Note: app sync requires the API key to hold the `apps:write` scope and the server to have valid App Store Connect credentials (`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_PRIVATE_KEY_PATH`). If `app_sync_all` returns an auth/credential error, report it plainly rather than retrying.
