import { NextRequest, NextResponse } from 'next/server'
import { authorizeMapsRequest, fetchGoogleMaps, mapsError } from '@/server/google-maps/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type GooglePrediction = {
  description: string
  place_id: string
  structured_formatting?: {
    main_text?: string
    secondary_text?: string
  }
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input')?.trim()

  if (!input || input.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  if (input.length > 200) return mapsError(400)
  const denied = await authorizeMapsRequest(request)
  if (denied) return denied

  const params = new URLSearchParams({
    input,
    language: 'pl',
    components: 'country:pl',
    types: 'address',
    location: '54.4416,18.5601',
    radius: '35000',
  })

  try {
    const data = await fetchGoogleMaps('autocomplete', params)
    const predictions = Array.isArray(data.predictions) ? (data.predictions as GooglePrediction[]) : []

    return NextResponse.json({
      suggestions: predictions.slice(0, 5).map((prediction) => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting?.main_text ?? prediction.description,
        secondaryText: prediction.structured_formatting?.secondary_text ?? '',
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return mapsError(502) }
}
