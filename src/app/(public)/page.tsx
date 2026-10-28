'use client'

import DeliveryForm from '@/app/components/DeliveryForm'
import LoadingButton from '@/app/components/LoadingButton'
import RestaurantMap from '@/app/components/RestaurantMap'
import { Skeleton } from '@/app/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { RESTAURANT_COORDINATES } from '@/config/constants'
import { type DeliveryZone } from '../types/types'
import { trpc } from '@/utils/trpc'
import { DeliveryMapLoader } from '@/app/components/DeliveryMapLoader'
import Image from 'next/image'
import { Bike, Info, Loader2, Mail, Phone, Store } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

const FORCE_ORDERING_OPEN_FOR_TEST =
  process.env.NEXT_PUBLIC_FORCE_ORDERING_OPEN === 'true'

const Home = () => {
  const [activeTab, setActiveTab] = useState('delivery')
  const [formData, setFormData] = useState({ address: '' })
  const [addressVerified, setAddressVerified] = useState(false)
  const { data: settingsData, isLoading: isSettingsLoading } = trpc.settings.getSettings.useQuery()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isOrderingOpen = FORCE_ORDERING_OPEN_FOR_TEST || settingsData?.isOrderingOpen

  const deliveryZones: DeliveryZone[] = useMemo(() => {
    if (!Array.isArray(settingsData?.deliveryZones)) return []
    return settingsData.deliveryZones as unknown as DeliveryZone[]
  }, [settingsData])

  const deliveryFromPrice = useMemo(() => {
    const prices = deliveryZones
      .map((zone) => zone.price)
      .filter((price) => Number.isFinite(price))

    if (prices.length > 0) return Math.min(...prices)
    return typeof settingsData?.deliveryCost === 'number' ? settingsData.deliveryCost : 0
  }, [deliveryZones, settingsData])

  const goToOrder = () => {
    startTransition(() => {
      router.push('/order')
    })
  }

  return (
    <main className="min-h-screen bg-secondary">
      <section className="relative min-h-screen overflow-hidden pt-16">
        <div className="absolute inset-0 bg-[url('/img/main-page.webp')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,48,124,0.96)_0%,rgba(18,48,124,0.78)_48%,rgba(18,48,124,0.34)_78%,rgba(18,48,124,0.08)_100%)]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-6xl items-center gap-5 px-4 py-6 lg:grid-cols-[minmax(420px,500px)_minmax(420px,520px)] lg:content-center lg:items-stretch lg:justify-center lg:px-6">
          <div className="mx-auto w-full max-w-[520px] lg:order-2 lg:max-w-none">
            <div className="w-full rounded-[24px] border border-white/35 bg-white/18 p-4 shadow-[0_24px_90px_rgba(9,24,61,0.28)] backdrop-blur-2xl md:p-6">
              <div className="flex justify-center">
                <Image
                  src="/img/page-main-logo.png"
                  alt="Spoko Sopot"
                  width={240}
                  height={86}
                  className="h-auto w-52 object-contain"
                  priority
                />
              </div>

              <h1 className="mt-5 text-center text-3xl font-semibold leading-tight text-slate-950">
                Zamów tak, jak Ci wygodnie.
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-center text-sm font-medium leading-6 text-slate-800">
                Dostawa pod wskazany adres albo szybki odbiór w restauracji.
              </p>

              {isSettingsLoading ? (
                <Skeleton className="mt-4 h-11 w-full rounded-xl" />
              ) : !isOrderingOpen ? (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  <Info size={17} className="mt-0.5 shrink-0 text-amber-600" />
                  <span>Zamawianie online jest chwilowo niedostępne. Skontaktuj się z restauracją albo odwiedź nas osobiście.</span>
                </div>
              ) : null}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-white/55 p-1.5 shadow-inner shadow-slate-950/5">
                  <TabsTrigger
                    value="delivery"
                    className="min-h-[88px] flex-col items-start justify-center gap-1 rounded-xl px-4 py-3 text-left text-slate-500 data-[state=active]:bg-secondary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-secondary/20"
                  >
                    <Bike size={18} />
                    <span className="text-sm font-semibold">Dostawa</span>
                    <span className="text-[11px] font-normal opacity-70">od {deliveryFromPrice} zł</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="take-out"
                    className="min-h-[88px] flex-col items-start justify-center gap-1 rounded-xl px-4 py-3 text-left text-slate-500 data-[state=active]:bg-secondary data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-secondary/20"
                  >
                    <Store size={18} />
                    <span className="text-sm font-semibold">Odbiór</span>
                    <span className="text-[11px] font-normal opacity-70">Hestii 3, 81-731 Sopot</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="delivery" className="mt-4 space-y-3">
                  <DeliveryForm
                    formData={formData}
                    onFormDataChange={setFormData}
                    addressVerified={addressVerified}
                    setAddressVerified={setAddressVerified}
                    setAddressCoordinates={() => {}}
                  />

                  {addressVerified && (
                    <LoadingButton
                      isLoading={isPending}
                      type="button"
                      className="h-12 w-full rounded-xl bg-primary font-semibold text-secondary hover:bg-primary/85"
                      onClick={goToOrder}
                    >
                      Przejdź do menu
                    </LoadingButton>
                  )}
                </TabsContent>

                <TabsContent value="take-out" className="mt-4 space-y-3">
                  <div className="rounded-xl border border-border bg-slate-50 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <Store size={18} className="mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Odbiór w restauracji</p>
                        <p className="mt-1 text-sm text-slate-500">Hestii 3, 81-731 Sopot</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                          Pn-Pt: 10:00 - 19:00, Sb-Nd: 8:00 - 19:00
                        </p>
                      </div>
                    </div>
                  </div>

                  <LoadingButton
                    isLoading={isPending}
                    type="button"
                    className="h-12 w-full rounded-xl bg-primary font-semibold text-secondary hover:bg-primary/85"
                    onClick={goToOrder}
                  >
                    Przejdź do menu
                  </LoadingButton>
                </TabsContent>
              </Tabs>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/40 pt-4 text-sm font-medium text-primary">
                <a href="tel:530659666" className="flex items-center justify-center gap-2 transition hover:text-primary/75">
                  <Phone size={16} className="shrink-0" />
                  <span>530 659 666</span>
                </a>
                <a href="mailto:info@spokosopot.pl" className="flex items-center justify-center gap-2 transition hover:text-primary/75">
                  <Mail size={16} className="shrink-0" />
                  <span>info@spokosopot.pl</span>
                </a>
              </div>
            </div>
          </div>

          <div className="hidden lg:order-1 lg:flex">
            <div className="flex w-full flex-col rounded-[24px] border border-white/35 bg-white/18 p-4 shadow-[0_24px_90px_rgba(9,24,61,0.24)] backdrop-blur-2xl">
              <div className="mb-4 flex flex-col items-center gap-3">
                <Image
                  src="/img/page-main-logo.png"
                  alt="Spoko Sopot"
                  width={260}
                  height={93}
                  className="h-auto w-56 object-contain drop-shadow-md"
                  priority
                />
                <p className="text-sm font-medium text-white/80">Sprawdź, gdzie dowozimy</p>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/35 bg-slate-100/80">
                <DeliveryMapLoader
                  loadingElement={
                    <div className="flex h-full min-h-[280px] w-full items-center justify-center bg-secondary/10">
                      <div className="flex flex-col items-center gap-3 text-primary">
                        <Loader2 size={28} className="animate-spin" />
                        <span className="text-sm font-semibold">Ładowanie mapy</span>
                      </div>
                    </div>
                  }
                >
                  <div className="h-full w-full">
                    <RestaurantMap
                      center={RESTAURANT_COORDINATES}
                      zoom={11.5}
                      markers={[RESTAURANT_COORDINATES]}
                      deliveryZones={deliveryZones}
                    />
                  </div>
                </DeliveryMapLoader>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Home
