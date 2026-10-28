import { NextRequest, NextResponse } from 'next/server'
import { authorizeMapsRequest, fetchGeoapify, mapsError } from '@/server/geoapify/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input')?.trim()

  if (!input || input.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  if (input.length > 200) return mapsError(400)
  const denied = await authorizeMapsRequest(request)
  if (denied) return denied

  // bias is lon,lat (Geoapify convention), centered on Sopot.
  const params = new URLSearchParams({
    text: input,
    lang: 'pl',
    filter: 'countrycode:pl',
    bias: 'proximity:18.5601,54.4416',
    limit: '5',
    type: 'street',
  })

  try {
    const results = await fetchGeoapify('autocomplete', params)

    return NextResponse.json({
      suggestions: results.slice(0, 5).map((result) => ({
        placeId: result.place_id ?? result.formatted ?? '',
        description: result.formatted ?? '',
        mainText: result.address_line1 ?? result.formatted ?? '',
        secondaryText: result.address_line2 ?? '',
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return mapsError(502) }
}
