'use client'

import { LoadScriptNext, type Libraries } from '@react-google-maps/api'
import type { ReactElement } from 'react'

const libraries: Libraries = ['geometry']

export function DeliveryMapLoader({ children, loadingElement }: { children: ReactElement; loadingElement?: ReactElement }) {
  // This key is intentionally public and MUST be restricted in Google Cloud to
  // Maps JavaScript API and the exact production website referrers. No fallback.
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  if (!browserKey) return (
    <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-sm text-slate-600">
      Mapa jest chwilowo niedostępna. W sprawie dostawy zadzwoń: 530 659 666.
    </div>
  )
  return <LoadScriptNext googleMapsApiKey={browserKey} libraries={libraries} loadingElement={loadingElement}>
    {children}
  </LoadScriptNext>
}
