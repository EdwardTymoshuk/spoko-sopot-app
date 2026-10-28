'use client'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/app/components/ui/form'
import { Input } from '@/app/components/ui/input'
import { RESTAURANT_COORDINATES } from '@/config/constants'
import {
  Coordinates,
  getCoordinates,
  haversineDistance,
} from '@/utils/deliveryUtils'
import { trpc } from '@/utils/trpc'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { DeliveryZone } from '../types/types'
import LoadingButton from './LoadingButton'

const formSchema = z.object({
  address: z.string().min(1, 'Wprowadź adres').max(200),
})

type FormData = z.infer<typeof formSchema>

type AddressSuggestion = {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

interface DeliveryFormProps {
  formData: FormData
  onFormDataChange: (data: FormData) => void
  addressVerified: boolean
  setAddressVerified: (verified: boolean) => void
  setAddressCoordinates: (coordinates: Coordinates | null) => void // Додаємо пропс
}

export default function DeliveryForm({
  formData,
  onFormDataChange,
  addressVerified,
  setAddressVerified,
  setAddressCoordinates,
}: DeliveryFormProps) {
  const [addressValid, setAddressValid] = useState(true)
  const [loading, setLoading] = useState(false)
  const [addressQuery, setAddressQuery] = useState(formData.address)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formData,
  })

  const { data: settingsData, isLoading: isSettingsLoading } =
    trpc.settings.getSettings.useQuery()
  // Parse delivery zones with type safety
  const deliveryZones: DeliveryZone[] = useMemo(() => {
    try {
      return Array.isArray(settingsData?.deliveryZones)
        ? (settingsData?.deliveryZones as unknown as DeliveryZone[])
        : []
    } catch {
      console.error('Failed to parse delivery zones from settings.')
      return []
    }
  }, [settingsData])

  useEffect(() => {
    const input = addressQuery.trim()

    if (input.length < 3) {
      setSuggestions([])
      setSuggestionsOpen(false)
      setSuggestionsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true)

      try {
        const response = await fetch(`/api/address-suggestions?input=${encodeURIComponent(input)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          setSuggestions([])
          setSuggestionsOpen(false)
          return
        }

        const data = await response.json()
        const nextSuggestions = Array.isArray(data.suggestions)
          ? (data.suggestions as AddressSuggestion[])
          : []

        setSuggestions(nextSuggestions)
        setSuggestionsOpen(nextSuggestions.length > 0)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setSuggestionsOpen(false)
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionsLoading(false)
        }
      }
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [addressQuery])

  const onSubmit = async (values: FormData) => {
    setLoading(true)
    setAddressVerified(false)

    try {
      const address = values.address
      const deliveryCoordinates = await getCoordinates(address)

      if (!deliveryCoordinates) {
        toast.error('Podany adres nie istnieje.')
        setLoading(false)
        return
      }

      const inDeliveryArea = deliveryZones.some((zone) => {
        const distance =
          haversineDistance(RESTAURANT_COORDINATES, deliveryCoordinates) / 1000
        return distance >= zone.minRadius && distance <= zone.maxRadius
      })

      setAddressCoordinates(deliveryCoordinates)

      if (inDeliveryArea) {
        setAddressVerified(true)
        toast.success(
          'Świetna wiadomość, Twój adres znajduje się w zasięgu naszej dostawy.'
        )
        localStorage.setItem('deliveryAddress', values.address)
      } else {
        toast.warning(
          'Niestety, Twój adres znajduje się poza зasięgiem naszej dostawy.'
        )
      }

    } catch {
      toast.error('Sprawdzanie adresu jest chwilowo niedostępne. Zadzwoń: 530 659 666.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="address"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      autoComplete="off"
                      onBlur={() => {
                        window.setTimeout(() => setSuggestionsOpen(false), 150)
                      }}
                      onChange={(event) => {
                        const value = event.target.value
                        field.onChange(value)
                        onFormDataChange({ address: value })
                        setAddressQuery(value)
                        setAddressValid(true)
                        setAddressVerified(false)
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) setSuggestionsOpen(true)
                      }}
                      className={`${
                        fieldState.invalid || !addressValid
                          ? 'border-danger'
                          : ''
                      } h-12 rounded-xl bg-white px-4 pr-10 text-sm`}
                      placeholder="Wprowadź adres dostawy"
                    />

                    {suggestionsLoading && (
                      <Loader2
                        size={17}
                        className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary"
                      />
                    )}

                    {suggestionsOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-secondary/20">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.placeId}
                            type="button"
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-primary/10"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              form.setValue('address', suggestion.description, { shouldValidate: true })
                              onFormDataChange({ address: suggestion.description })
                              setAddressQuery(suggestion.description)
                              setSuggestions([])
                              setSuggestionsOpen(false)
                              setAddressValid(true)
                              setAddressVerified(false)
                            }}
                          >
                            <MapPin size={17} className="mt-0.5 shrink-0 text-primary" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {suggestion.mainText}
                              </span>
                              {suggestion.secondaryText && (
                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                  {suggestion.secondaryText}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Використовуємо одну кнопку для обох випадків */}
          {/* <LoadingButton
						isLoading={loading || isPending} // Показуємо стан завантаження під час переходу
						type={addressVerified ? "button" : "submit"}
						variant='secondary'
						className="w-full my-4"
						onClick={handleOrderClick}
					>
						{addressVerified ? (
							<div className="flex items-center">
								Do zamówienia <MdOutlineKeyboardArrowRight />
							</div>
						) : (
							"Sprawdź"
						)}
					</LoadingButton> */}
          <LoadingButton
            isLoading={loading}
            type="submit"
            variant="default"
            className="h-12 w-full rounded-xl bg-primary text-secondary hover:bg-primary/90"
          >
            Sprawdź
          </LoadingButton>
        </form>
      </Form>
    </div>
  )
}
