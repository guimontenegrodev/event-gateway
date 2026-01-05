export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return
    }

    if (
      !env.GADS_DEVELOPER_TOKEN ||
      !env.GADS_CLIENT_ID ||
      !env.GADS_CLIENT_SECRET ||
      !env.GADS_REFRESH_TOKEN ||
      !env.GADS_CUSTOMER_ID
    ) {
      throw new Error('Google Ads env vars not configured')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return
    }

    const { event, user, custom } = body || {}

    if (!event?.name || !event?.triggered_at) {
      return
    }

    if (!user?.email && !user?.phone) {
      return
    }

    const accessTokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GADS_CLIENT_ID,
        client_secret: env.GADS_CLIENT_SECRET,
        refresh_token: env.GADS_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    })

    const accessTokenData = await accessTokenRes.json()
    const accessToken = accessTokenData.access_token

    if (!accessToken) {
      throw new Error('Google Ads auth failed')
    }

    const payload = {
      conversions: [
        {
          conversion_action: custom?.conversion_action,
          conversion_date_time: event.triggered_at,
          conversion_value: custom?.value || 0,
          currency_code: custom?.currency || 'BRL',
          user_identifiers: [
            user.email
              ? { hashed_email: user.email }
              : null,
            user.phone
              ? { hashed_phone_number: user.phone }
              : null
          ].filter(Boolean)
        }
      ],
      partial_failure: true
    }

    await fetch(
      `https://googleads.googleapis.com/v14/customers/${env.GADS_CUSTOMER_ID}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': env.GADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
  }
}
