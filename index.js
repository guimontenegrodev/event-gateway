import fb from './fb'
import ga4 from './ga4'
import gads from './gads'

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error('Invalid JSON body', e)
      return new Response('Invalid JSON', { status: 400 })
    }

    const url = new URL(request.url)
    const query = Object.fromEntries(url.searchParams.entries())
    const headers = request.headers

    if (query.fb_pixel_id && env.fb_access_token) {
      ctx.waitUntil(fb.fetch(headers, query, body, env))
    }

    if (query.ga_measurement_id && env.GA4_API_SECRET) {
      ctx.waitUntil(ga4.fetch(headers, query, body, env))
    }

    if (
      env.GADS_DEVELOPER_TOKEN &&
      query.gads_client_id &&
      env.GADS_CLIENT_SECRET &&
      env.GADS_REFRESH_TOKEN &&
      query.gads_customer_id
    ) {
      ctx.waitUntil(gads.fetch(headers, query, body, env))
    }

    return new Response('Worker started', {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  }
}
