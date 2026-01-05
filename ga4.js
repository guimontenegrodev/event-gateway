function isValidEventTime(ts) {
  const now = Math.floor(Date.now() / 1000)
  return ts <= now && now - ts <= 60 * 60 * 24 * 7
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
      return new Response('Google Analytics credentials not configured', { status: 500 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const { event, user, cookie, custom } = body || {}

    if (
      !event?.ga4_name ||
      !event?.id ||
      !event?.triggered_at ||
      !event?.source_url
    ) {
      return new Response('Invalid event payload', { status: 400 })
    }

    const eventTime = Math.floor(new Date(event.triggered_at).getTime() / 1000)

    if (!isValidEventTime(eventTime)) {
      return new Response('Invalid event_time', { status: 400 })
    }

    const clientId = cookie?.ga_client_id || null
    const userId = user?.id || null

    if (!clientId && !userId) {
      return new Response('Missing client identifier', { status: 400 })
    }

    const payload = {
      client_id: clientId || undefined,
      user_id: userId || undefined,
      timestamp_micros: eventTime * 1_000_000,
      events: [
        {
          name: event.ga4_name,
          params: {
            page_location: event.source_url,
            event_id: event.id,
            ...custom
          }
        }
      ]
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let res
    try {
      res = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      )
    } catch {
      return new Response('GA4 request failed', { status: 502 })
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
