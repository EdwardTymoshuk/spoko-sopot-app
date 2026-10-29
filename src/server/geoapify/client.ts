import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { reserveGeoapifyRequest } from './budget'

export function mapsError(status: number) {
  return NextResponse.json({ error: 'Usługa adresowa jest chwilowo niedostępna.' }, {
    status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
  })
}

export async function authorizeMapsRequest(request: NextRequest): Promise<NextResponse | null> {
  // Never fall back to a public/browser credential.
  if (!process.env.GEOAPIFY_SERVER_API_KEY) return mapsError(503)
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
  if (!await reserveGeoapifyRequest(request.headers.get('x-real-ip') ?? 'unknown')) return mapsError(429)
  return null
}

type GeoapifyFeatureProperties = {
  lat?: number
  lon?: number
  formatted?: string
  address_line1?: string
  address_line2?: string
  place_id?: string
}

export type GeoapifyResult = GeoapifyFeatureProperties

// Geoapify's IP allowlist for this key did not enforce reliably; the Referer
// allowlist did. This value is never sent to a browser or any public
// endpoint — it only authenticates our own outbound call to Geoapify.
const GEOAPIFY_SERVER_REFERER = 'https://internal.spoko-order.local/geoapify-proxy'

export async function fetchGeoapify(service: 'geocode' | 'autocomplete', params: URLSearchParams): Promise<GeoapifyResult[]> {
  // Without an explicit format, Geoapify returns GeoJSON (`features`), not `results`.
  params.set('format', 'json')
  params.set('apiKey', process.env.GEOAPIFY_SERVER_API_KEY!)
  // Fixed endpoint allowlist: caller cannot request an arbitrary Geoapify path.
  const path = service === 'geocode' ? 'geocode/search' : 'geocode/autocomplete'
  const response = await fetch(`https://api.geoapify.com/v1/${path}?${params}`, {
    cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { Referer: GEOAPIFY_SERVER_REFERER },
  })
  if (!response.ok) throw new Error('Geoapify request failed')
  const data = await response.json()
  const results = Array.isArray(data.results) ? (data.results as GeoapifyResult[]) : []
  return results
}
