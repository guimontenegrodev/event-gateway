async function sha256(value) {
  const data = new TextEncoder().encode(value.trim().toLowerCase())
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function isValidEventTime(dateTime) {
  const ts = Math.floor(new Date(dateTime).getTime() / 1000)
  const now = Math.floor(Date.now() / 1000)
  return ts <= now && now - ts <= 60 * 60 * 24 * 7
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    if (
      !env.GADS_DEVELOPER_TOKEN ||
      !env.GADS_CLIENT_ID ||
      !env.GADS_CLIENT_SECRET ||
      !env.GADS_REFRESH_TOKEN ||
      !env.GADS_CUSTOMER_ID
    ) {
      return new Response('Google Ads credentials not configured', { status: 500 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const { event, user, custom } = body || {}

    if (
      !event?.gads_name ||
      !event?.triggered_at ||
      !custom?.conversion_action
    ) {
      return new Response('Invalid event payload', { status: 400 })
    }

    if (!isValidEventTime(event.triggered_at)) {
      return new Response('Invalid conversion_date_time', { status: 400 })
    }

    if (!user?.email && !user?.phone) {
      return new Response('Missing user identifiers', { status: 400 })
    }

    const identifiers = []

    if (user.email) {
      identifiers.push({ hashed_email: await sha256(user.email) })
    }

    if (user.phone) {
      identifiers.push({ hashed_phone_number: await sha256(user.phone) })
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GADS_CLIENT_ID,
        client_secret: env.GADS_CLIENT_SECRET,
        refresh_token: env.GADS_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    })

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return new Response('Google Ads auth failed', { status: 502 })
    }

    const payload = {
      conversions: [
        {
          conversion_action: custom.conversion_action,
          conversion_date_time: event.triggered_at,
          conversion_value: custom?.value || 0,
          currency_code: custom?.currency || 'BRL',
          user_identifiers: identifiers
        }
      ],
      partial_failure: true
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let res
    try {
      res = await fetch(
        `https://googleads.googleapis.com/v14/customers/${env.GADS_CUSTOMER_ID}:uploadClickConversions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': env.GADS_DEVELOPER_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      )
    } catch {
      return new Response('Google Ads request failed', { status: 502 })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      const text = await res.text()
      return new Response(text, { status: 502 })
    }

    return new Response(null, { status: 204 })
  }
}
