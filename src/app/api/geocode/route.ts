import { NextRequest, NextResponse } from 'next/server'
import { authorizeMapsRequest, fetchGoogleMaps, mapsError } from '@/server/google-maps/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim()
  if (!address || address.length < 5 || address.length > 250) return mapsError(400)
  const denied = await authorizeMapsRequest(request)
  if (denied) return denied
  try {
    const data = await fetchGoogleMaps('geocode', new URLSearchParams({ address, language: 'pl', components: 'country:PL' }))
    const point = data.results?.[0]?.geometry?.location
    const coordinates = point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
      ? { lat: point.lat, lng: point.lng } : null
    return NextResponse.json({ coordinates }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return mapsError(502) }
}
