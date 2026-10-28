import { NextRequest, NextResponse } from 'next/server'
import { authorizeMapsRequest, fetchGeoapify, mapsError } from '@/server/geoapify/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim()
  if (!address || address.length < 5 || address.length > 250) return mapsError(400)
  const denied = await authorizeMapsRequest(request)
  if (denied) return denied
  try {
    const results = await fetchGeoapify('geocode', new URLSearchParams({ text: address, lang: 'pl', filter: 'countrycode:pl' }))
    const point = results[0]
    const coordinates = point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      ? { lat: point.lat as number, lng: point.lon as number } : null
    return NextResponse.json({ coordinates }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return mapsError(502) }
}
