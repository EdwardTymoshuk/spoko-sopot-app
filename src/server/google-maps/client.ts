import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { reserveGoogleRequest } from './budget'

export function mapsError(status: number) {
  return NextResponse.json({ error: 'Usługa adresowa jest chwilowo niedostępna.' }, {
    status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
  })
}

export async function authorizeMapsRequest(request: NextRequest): Promise<NextResponse | null> {
  // Never fall back to a public/browser credential.
  if (!process.env.GOOGLE_MAPS_SERVER_API_KEY) return mapsError(503)
  // Supplementary browser protection; headers are not authentication.
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return mapsError(403)
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const allowed = new Set(['https://order.spokosopot.pl', 'https://admin.spokosopot.pl'])
  if (process.env.NODE_ENV !== 'production') allowed.add(request.nextUrl.origin)
  try {
    if (origin && !allowed.has(new URL(origin).origin)) return mapsError(403)
    if (referer && !allowed.has(new URL(referer).origin)) return mapsError(403)
  } catch { return mapsError(403) }
  // Nginx overwrites X-Real-IP on this deployment. The shared daily cap also
  // bounds calls if a client bypasses the proxy or forges headers.
  if (!await reserveGoogleRequest(request.headers.get('x-real-ip') ?? 'unknown')) return mapsError(429)
  return null
}

export async function fetchGoogleMaps(service: 'geocode' | 'autocomplete', params: URLSearchParams) {
  params.set('key', process.env.GOOGLE_MAPS_SERVER_API_KEY!)
  const path = service === 'geocode' ? 'geocode/json' : 'place/autocomplete/json'
  // Fixed endpoint allowlist: caller cannot request Text Search or arbitrary URLs.
  const response = await fetch(`https://maps.googleapis.com/maps/api/${path}?${params}`, {
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Google Maps request failed')
  const data = await response.json()
  if (!['OK', 'ZERO_RESULTS'].includes(data.status)) throw new Error('Google Maps service unavailable')
  return data
}
