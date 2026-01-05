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
    if (
      !env.GADS_DEVELOPER_TOKEN ||
      !env.GADS_CLIENT_ID ||
      !env.GADS_CLIENT_SECRET ||
      !env.GADS_REFRESH_TOKEN ||
      !env.GADS_CUSTOMER_ID
    ) {
      console.warn('Google Ads credentials not configured')
    }

    let body
    try {
      body = await request.json()
    } catch {
      console.warn('Invalid JSON')
    }

    const { event, user, custom } = body || {}

    if (
      !event?.gads_name ||
      !event?.triggered_at ||
      !custom?.conversion_action
    ) {
      console.warn('Invalid event payload')
    }

    if (!isValidEventTime(event.triggered_at)) {
      console.warn('Invalid conversion_date_time')
    }

    if (!user?.email && !user?.phone) {
      console.warn('Missing user identifiers')
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
      console.warn('Google Ads auth failed')
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
      console.warn('Google Ads request failed')
    } finally {
      clearTimeout(timeout)
    }

    const text = await res.text()
    console.warn(text)
  }
}