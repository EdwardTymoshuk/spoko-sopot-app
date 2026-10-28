'use client'

import type { ReactElement } from 'react'

export function DeliveryMapLoader({ children }: { children: ReactElement; loadingElement?: ReactElement }) {
  // This key is intentionally public and MUST be restricted in Geoapify to the
  // exact production website referrers. No fallback to a server-only key.
  const browserKey = process.env.NEXT_PUBLIC_GEOAPIFY_BROWSER_KEY
  if (!browserKey) return (
    <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-sm text-slate-600">
      Mapa jest chwilowo niedostępna. W sprawie dostawy zadzwoń: 530 659 666.
    </div>
  )
  return <>{children}</>
}
