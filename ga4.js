export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return
    }

    if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
      throw new Error('GA4 env vars not configured')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return
    }

    const { event, user, cookie, custom } = body || {}

    if (!event?.ga4_name || !event?.source_url) {
      return
    }

    const payload = {
      client_id: cookie?.ga_client_id || undefined,
      user_id: user?.id || undefined,
      events: [
        {
          name: event.name,
          params: {
            page_location: event.source_url,
            event_id: event.id,
            ...custom
          }
        }
      ]
    }

    if (!payload.client_id && !payload.user_id) {
      return
    }

    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
  }
}
