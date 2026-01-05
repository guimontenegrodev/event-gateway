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
  async fetch(headers, query, body, env) {
    if (!body) {
      console.error('Google Ads - Empty body')
      return
    }

    const { event, user, custom } = body

    if (
      !event?.gads_name ||
      !event?.triggered_at ||
      !custom?.conversion_action
    ) {
      console.error('Google Ads - Invalid event payload')
      return
    }

    if (!isValidEventTime(event.triggered_at)) {
      console.error('Google Ads - Invalid conversion_date_time')
      return
    }

    if (!user?.email && !user?.phone) {
      console.error('Google Ads - Missing user identifiers')
      return
    }

    if (!query.gads_customer_id || !query.gads_client_id) {
      console.error('Google Ads - Missing query identifiers')
      return
    }

    const identifiers = []

    if (user.email) {
      identifiers.push({ hashed_email: await sha256(user.email) })
    }

    if (user.phone) {
      identifiers.push({ hashed_phone_number: await sha256(user.phone) })
    }

    let accessToken
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: query.gads_client_id,
          client_secret: env.GADS_CLIENT_SECRET,
          refresh_token: env.GADS_REFRESH_TOKEN,
          grant_type: 'refresh_token'
        })
      })

      const tokenData = await tokenRes.json()
      accessToken = tokenData.access_token
    } catch (e) {
      console.error('Google Ads - Auth request failed', e)
      return
    }

    if (!accessToken) {
      console.error('Google Ads - Auth failed')
      return
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

    try {
      const res = await fetch(
        `https://googleads.googleapis.com/v14/customers/${query.gads_customer_id}:uploadClickConversions`,
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

      const text = await res.text()
      if (!res.ok) {
        console.error('Google Ads - API error', text)
      }
    } catch (e) {
      console.error('Google Ads - Request failed', e)
    } finally {
      clearTimeout(timeout)
    }
  }
}