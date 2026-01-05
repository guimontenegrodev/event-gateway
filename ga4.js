function isValidEventTime(ts) {
  const now = Math.floor(Date.now() / 1000)
  return ts <= now && now - ts <= 60 * 60 * 24 * 7
}

export default {
  async fetch(headers, query, body, env) {
    const { event, user, custom } = body

    if (
      !event?.ga4_name ||
      !event?.id ||
      !event?.triggered_at ||
      !event?.source_url
    ) {
      console.error('Google Analytics 4 - Invalid event payload')
      return
    }

    if (!query.ga_measurement_id) {
      console.error('Google Analytics 4 - Missing ga_measurement_id')
      return
    }

    const eventTime = Math.floor(new Date(event.triggered_at).getTime() / 1000)

    if (!isValidEventTime(eventTime)) {
      console.error('Google Analytics 4 - Invalid event_time')
      return
    }

    if (!user?.ga_id && !user?.id) {
      console.error('Google Analytics 4 - User identifier missing')
      return
    }

    const payload = {
      client_id: user?.ga_id,
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

    try {
      const res = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${query.ga_measurement_id}&api_secret=${env.GA4_API_SECRET}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      )

      const text = await res.text()
      if (!res.ok) {
        console.error('Google Analytics 4 - API error', text)
      }
    } catch (e) {
      console.error('Google Analytics 4 - Request failed', e)
    } finally {
      clearTimeout(timeout)
    }
  }
}
