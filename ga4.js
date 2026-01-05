function isValidEventTime(ts) {
  const now = Math.floor(Date.now() / 1000)
  return ts <= now && now - ts <= 60 * 60 * 24 * 7
}

export default {
  async fetch(request, env) {
    if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
      console.warn('Google Analytics 4 - Credentials not configured')
    }

    let body
    try {
      body = await request.json()
    } catch {
      console.warn('Google Analytics 4 - Invalid JSON')
    }

    const { event, user, cookie, custom } = body || {}

    if (
      !event?.ga4_name ||
      !event?.id ||
      !event?.triggered_at ||
      !event?.source_url
    ) {
      console.warn('Google Analytics 4 - Invalid event payload')
    }

    const eventTime = Math.floor(new Date(event.triggered_at).getTime() / 1000)

    if (!isValidEventTime(eventTime)) {
      console.warn('Google Analytics 4 - Invalid event_time')
    }

    if (!user?.ga4_id && !user?.id) {
      console.warn('Google Analytics 4 - User identifier missing')
    }

    const payload = {
      client_id: user?.ga4_id,
      user_id: user?.id,
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
      console.warn('Google Analytics 4 - GA4 request failed')
    } finally {
      clearTimeout(timeout)
    }

    const resText = await res.text()
    const text = resText || 'Evento processado com sucesso'
    console.warn('Google Ads - ' + text)
  }
}