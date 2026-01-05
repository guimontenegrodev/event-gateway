import fb from './fb'
import ga4 from './ga4'
import gads from './gads'

export default {
  fetch(request, env, ctx) {
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
      console.warn('Method Not Allowed')
    }

    if (env.FB_PIXEL_ID && env.FB_ACCESS_TOKEN) {
      ctx.waitUntil(fb.fetch(request.clone(), env))
    } else {
      console.warn('Facebook events skipped: env variables missing')
    }

    if (env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET) {
      ctx.waitUntil(ga4.fetch(request.clone(), env))
    } else {
      console.warn('Google Analytics events skipped: env variables missing')
    }

    if (
      env.GADS_DEVELOPER_TOKEN &&
      env.GADS_CLIENT_ID &&
      env.GADS_CLIENT_SECRET &&
      env.GADS_REFRESH_TOKEN &&
      env.GADS_CUSTOMER_ID
    ) {
      ctx.waitUntil(gads.fetch(request.clone(), env))
    } else {
      console.warn('Google Ads events skipped: env variables missing')
    }

    return new Response('Worker started', { status: 200 })
  }
}