# event-gateway

Server-side **event ingestion gateway** built on **Cloudflare Workers**.

Receives a single event payload and forwards it asynchronously to multiple platforms:

* Meta (Facebook) Conversion API
* Google Analytics 4 (Measurement Protocol)
* Google Ads (Enhanced / Offline Conversions)

Always responds **immediately (HTTP 200)** to the browser.
All third-party calls run in the background.

---

## Architecture

* Cloudflare Worker (API-only)
* Single entry point: `index.js`
* Platform-specific handlers:

  * `fb.js`
  * `ga4.js`
  * `gads.js`

`index.js` acts as a **router / fan-out**, deciding which platforms execute based on available environment variables.

---

## Repository structure

```
/
  index.js
  fb.js
  ga4.js
  gads.js
  wrangler.toml
```

---

## Expected payload (POST)

```json
{
  "event": {
    "fb_name": "Lead",
    "ga4_name": "generate_lead",
    "gads_name": "generate_lead",
    "id": "evt_123",
    "triggered_at": "2026-01-05T12:00:00Z",
    "source": "website",
    "source_url": "https://example.com/thank-you"
  },
  "user": {
    "id": "user_123",
    "email": "user@email.com",
    "phone": "+5511999999999"
  },
  "cookie": {
    "fbp": "fb.1...",
    "fbc": "fb.1...",
    "ga_client_id": "123.456"
  },
  "custom": {
    "utm_source": "meta",
    "utm_campaign": "campaign_name",
    "conversion_action": "customers/XXX/conversionActions/YYY",
    "value": 100,
    "currency": "BRL"
  }
}
```

---

## Runtime behavior

* Always returns **HTTP 200** instantly
* Uses `ctx.waitUntil` for background execution
* Failure in one platform does **not** affect others
* Missing platform env vars → events are **skipped with logs**
* No tracking response is exposed to the browser

---

## Environment variables

### Meta (Facebook CAPI)

* `FB_PIXEL_ID`
* `FB_ACCESS_TOKEN`
* `FB_TEST_EVENT_CODE`

### Google Analytics 4

* `GA4_MEASUREMENT_ID`
* `GA4_API_SECRET`

### Google Ads

* `GADS_DEVELOPER_TOKEN`
* `GADS_CLIENT_ID`
* `GADS_CLIENT_SECRET`
* `GADS_REFRESH_TOKEN`
* `GADS_CUSTOMER_ID`

All variables must be configured as **Secrets** in Cloudflare.
FB_TEST_EVENT_CODE must be empty for production.
---

## Cloudflare configuration

### `wrangler.toml`

```toml
name = "event-gateway"
main = "index.js"
compatibility_date = "2026-01-05"
```

---

## Deploy (GitHub → Cloudflare Workers)

* **Build command:** empty or `echo "skip"`
* **Deploy command:**

```bash
npx wrangler deploy
```

Secrets are injected by Cloudflare and are **not versioned**.

---

## Observability

* Logs via `console.warn`
* Explicit errors only for internal misconfiguration
* Safe for production traffic

---

## Status

✅ Production-ready
✅ Platform-agnostic payload
✅ Extensible architecture
✅ Server-side tracking friendly
