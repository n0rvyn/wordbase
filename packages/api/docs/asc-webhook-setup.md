# App Store Connect Webhook Setup

This document explains how to configure App Store Connect (ASC) webhook notifications so WordBase can automatically refresh App metadata when a new version is submitted or released.

## Overview

WordBase receives ASC webhook notifications at `POST /api/apps/asc-webhook`. When an `APP_STORE_VERSION_CHANGED` event arrives with a valid HMAC-SHA256 signature, WordBase re-syncs the matching App's metadata from both iTunes Lookup and the ASC API.

## Step 1: Generate a Webhook Secret

Choose a long random string for `ASC_WEBHOOK_SECRET`:

```sh
openssl rand -hex 32
```

Add it to your server's environment:

```
ASC_WEBHOOK_SECRET=<your-generated-secret>
```

## Step 2: Configure the Webhook in App Store Connect

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Go to **Users and Access** → **Integrations** → **Webhooks**.
3. Click **+** to add a new webhook.
4. Set the **URL** to:
   ```
   https://<your-domain>/api/apps/asc-webhook
   ```
5. Set the **Secret** to the same value as `ASC_WEBHOOK_SECRET`.
6. Select at minimum the **App Version State Changed** event type.
7. Save.

ASC will sign each notification with `HMAC-SHA256(rawBody, secret)` and include the hex digest in the `X-ASC-Signature` request header. WordBase verifies this before processing any event.

## Step 3: Verify the Endpoint is Reachable

After saving in ASC, use the "Send Test Notification" button (if available) or trigger a real version submission. Check your API logs for a `200 OK` response.

You can also test locally with a correctly signed curl request:

```sh
SECRET=<your-secret>
BODY='{"notificationType":"APP_STORE_VERSION_CHANGED","data":{"appAppleId":"361304891"}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -s -XPOST http://localhost:4100/api/apps/asc-webhook \
  -H "Content-Type: application/json" \
  -H "X-ASC-Signature: $SIG" \
  -d "$BODY"
```

Expected response: `{"ok":true}`

## Daily Ratings Sync (Cron)

App ratings are not covered by ASC webhooks (they change continuously). Add a daily cron job to keep ratings fresh:

```crontab
# Every day at 03:00 UTC — sync all App metadata (ratings + any missed updates)
0 3 * * * curl -s -XPOST https://<your-domain>/api/apps/sync \
  -H "Authorization: Bearer $WORDBASE_API_KEY" \
  >> /var/log/wordbase-sync.log 2>&1
```

Replace `$WORDBASE_API_KEY` with a valid API key from your `api_keys` table.
