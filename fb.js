async function sha256(value) {
    const data = new TextEncoder().encode(value.trim().toLowerCase())
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

function parsePhone(num) {
    if (!num) return null
    let n = num.replace(/\D/g, '')
    if (n.startsWith('0')) n = n.slice(1)
    if (n.length === 10 || n.length === 11) n = '55' + n
    else if (!((n.length === 12 || n.length === 13) && n.startsWith('55'))) return null
    return '+' + n
}

function isValidEventTime(ts) {
    const now = Math.floor(Date.now() / 1000)
    return ts <= now && now - ts <= 60 * 60 * 24 * 7
}

function isValidActionSource(source) {
    return [
        'website',
        'app',
        'email',
        'phone_call',
        'chat',
        'physical_store',
        'system_generated',
        'other'
    ].includes(source)
}

export default {
    async fetch(headers, query, body, env) {
        const { event, user, cookie, custom } = body

        if (
            !event?.fb_name ||
            !event?.triggered_at ||
            !event?.id ||
            !event?.source ||
            !event?.source_url
        ) {
            console.error('Facebook - Invalid event payload')
            return
        }

        if (!query.fb_pixel_id) {
            console.error('Facebook - Missing fb_pixel_id')
            return
        }

        const eventTime = Math.floor(new Date(event.triggered_at).getTime() / 1000)

        if (!isValidEventTime(eventTime)) {
            console.error('Facebook - Invalid event_time')
            return
        }

        if (!isValidActionSource(event.source)) {
            console.error('Facebook - Invalid action_source')
            return
        }

        const em = user?.email ? await sha256(user.email) : null
        const parsedPhone = parsePhone(user?.phone)
        const ph = parsedPhone ? await sha256(parsedPhone) : null

        const ip =
            headers.get('cf-connecting-ip') ||
            headers.get('x-forwarded-for')?.split(',')[0] ||
            null

        const ua = headers.get('user-agent')

        if (!ip || !ua) {
            console.error('Facebook - Missing client context')
            return
        }

        const payload = [
            {
                event_name: event.fb_name,
                event_time: eventTime,
                event_id: event.id,
                action_source: event.source,
                event_source_url: event.source_url,
                user_data: {
                    em,
                    ph,
                    client_ip_address: ip,
                    client_user_agent: ua,
                    fbp: cookie?.fbp || null,
                    fbc: cookie?.fbc || null
                },
                custom_data: custom || {}
            }
        ]

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        try {
            const requestBody = { data: payload }
            if (env.FB_TEST_EVENT_CODE) {
                requestBody.test_event_code = env.FB_TEST_EVENT_CODE
            }

            const res = await fetch(
                `https://graph.facebook.com/v18.0/${query.fb_pixel_id}/events?access_token=${env.fb_access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                }
            )

            const text = await res.text()
            if (!res.ok) {
                console.error('Facebook - API error', text)
            }
        } catch (e) {
            console.error('Facebook - Request failed', e)
        } finally {
            clearTimeout(timeout)
        }
    }
}
