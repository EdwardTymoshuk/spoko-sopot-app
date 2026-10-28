"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useDebounce } from "use-debounce"
import { z } from "zod"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Skeleton } from "@/app/components/ui/skeleton"
import { Textarea } from "@/app/components/ui/textarea"
import { DeliveryMapLoader } from "@/app/components/DeliveryMapLoader"

import RestaurantMap from "@/app/components/RestaurantMap"
import TimeDeliverySwitcher from "@/app/components/TimeDeliverySwitcher"

import { useCart } from "@/app/context/CartContext"
import { useCheckout } from "@/app/context/CheckoutContext"
import { useOrder } from "@/app/context/OrderContext"
import { DeliveryZone } from "@/app/types/types"
import { RESTAURANT_COORDINATES } from "@/config/constants"
import {
	Coordinates,
	getCoordinates,
	haversineDistance,
	isAddressInDeliveryArea,
} from "@/utils/deliveryUtils"
import { trpc } from "@/utils/trpc"

import CheckoutNipSection from "./CheckoutNipSection"
import CheckoutPaymentMethodSection from "./CheckoutPaymentMethodSection"
import CheckoutPromoCodeSection from "./CheckoutPromoCodeSection"

/**
 * Delivery schema for a full address, plus promoCode, nip, etc.
 */
const deliverySchema = z.object({
	name: z.string().min(1, "Podaj imię").max(20, "Imię jest zbyt długie"),
	phone: z
		.string()
		.regex(/^\+?[0-9]{9}$/, "Podaj numer telefonu w formacie xxxxxxxxxx"),
	city: z.string().min(3, "Podaj miasto").max(50),
	postalCode: z
		.string()
		.regex(/^\d{2}-\d{3}$/, "Kod pocztowy musi być w formacie 00-000"),
	street: z.string().min(1, "Podaj ulicę").max(50),
	buildingNumber: z.string().min(1, "Podaj numer budynku").max(10),
	apartment: z.preprocess(
		(val) => (val === "" ? undefined : isNaN(Number(val)) ? undefined : Number(val)),
		z.number().positive().optional()
	),
	paymentMethod: z.string().min(1, "Wybierz metodę płatności"),
	deliveryTime: z.union([
		z.literal("asap"),
		z.date().refine((date) => date > new Date(), {
			message: "Podaj poprawną godzinę dostawy",
		}),
	]),
	comment: z
		.string()
		.max(200, "Komentarz jest zbyt długi")
		.optional()
		.transform((val) => (val === "" ? undefined : val)),
	promoCode: z
		.string()
		.max(20, "Kod promocyjny jest zbyt długi")
		.optional()
		.transform((val) => (val === "" ? undefined : val)),
	nip: z
		.string()
		.optional()
		.transform((val) => (val === "" ? undefined : val))
		.refine((val) => val === undefined || /^[0-9]{10}$/.test(val), {
			message: "Podaj poprawny numer NIP z 10 cyfr",
		}),
})

type DeliveryFormData = z.infer<typeof deliverySchema>

/**
 * Props needed from a parent page to control privacy acceptance, loading states, etc.
 */
interface DeliveryFormProps {
	acceptPrivacy: boolean
	setPrivacyError: (val: boolean) => void
	isLoading: boolean
	setIsLoading: (val: boolean) => void
	isBreakfast: boolean
	settingsData: any
	deliveryZones: DeliveryZone[]
	deliveryCoordinates: Coordinates | null
	setDeliveryCoordinates: (coords: Coordinates | null) => void
}

/**
 * Full Delivery Form including address fields,
 * comment, integrated map, promo code, NIP, payment method, etc.
 */
export default function CheckoutDeliveryForm({
	acceptPrivacy,
	setPrivacyError,
	isLoading,
	setIsLoading,
	isBreakfast,
	settingsData,
	deliveryZones,
	deliveryCoordinates,
	setDeliveryCoordinates,
}: DeliveryFormProps) {
	const router = useRouter()
	const { state, dispatch } = useCart()
	const { setOrderData } = useOrder()
	const { isRestaurantClosed } = useCheckout()

	const createOrderMutation = trpc.order.create.useMutation()
	const markPromoCodeAsUsed = trpc.promoCode.markPromoCodeAsUsed.useMutation()
	const trpcContext = trpc.useUtils()

	const [isLoadingPromoCode, setIsLoadingPromoCode] = useState(false)
	const [deliveryErrorMessage, setDeliveryErrorMessage] = useState("")
	const [isNipRequired, setIsNipRequired] = useState(false)

	// Payment method can be tracked with watch or a local state:
	const paymentMethodRef = useRef<HTMLDivElement | null>(null)

	const [fullAddress, setFullAddress] = useState("")
	const [debouncedAddress] = useDebounce(fullAddress, 500)

	// React Hook Form initialization
	const form = useForm<DeliveryFormData>({
		resolver: zodResolver(deliverySchema),
		defaultValues: {
			name: "",
			phone: "",
			paymentMethod: "",
			city: "",
			postalCode: "",
			street: "",
			buildingNumber: "",
			apartment: undefined,
			deliveryTime: "asap",
			comment: "",
			promoCode: "",
			nip: "",
		},
		mode: "onChange",
	})

	const {
		register,
		handleSubmit,
		formState,
		setValue,
		getValues,
		setFocus,
		reset,
	} = form

	const { errors } = formState

	/**
	 * Handles successful form submission:
	 * checks privacy, address validity, then calls createOrderMutation.
	 */
	const onDeliverySubmit = async (data: DeliveryFormData) => {
		try {
			setIsLoading(true)
			if (!acceptPrivacy) {
				setPrivacyError(true)
				setIsLoading(false)
				return
			}
			const addressIsValid = await verifyAddress()
			if (!data.paymentMethod) {
				toast.error("Nie wybrano metody opłaty")
				setIsLoading(false)
				return
			}
			if (!addressIsValid) {
				setIsLoading(false)
				return
			}

			const promoCode = state.deliveryDiscount?.code
			const finalAmount = state.finalAmount
			const totalAmount = state.totalAmount

			const order = await createOrderMutation.mutateAsync({
				name: data.name,
				phone: data.phone,
				city: data.city,
				postalCode: data.postalCode,
				street: data.street,
				buildingNumber: data.buildingNumber,
				apartment: data.apartment,
				nip: data.nip,
				paymentMethod: data.paymentMethod,
				deliveryMethod: "DELIVERY",
				deliveryTime:
					data.deliveryTime === "asap"
						? new Date().toISOString()
						: data.deliveryTime.toISOString(),
				items: state.items.map((item) => ({
					menuItemId: item.menuItemId ?? item.id.split(':')[0],
					quantity: item.quantity,
					selectedOptions: item.selectedOptions,
				})),
				totalAmount,
				finalAmount,
				method: "DELIVERY",
				comment: data.comment,
				promoCode,
			})

			const { id, orderNumber, phone, name, deliveryMethod, deliveryTime } = order
			setOrderData(id, phone, name, deliveryMethod, deliveryTime.toISOString(), orderNumber)

			if (promoCode) {
				await markPromoCodeAsUsed.mutateAsync({ promoCode })
			}

			toast.success("Zamówienie złożone pomyślnie!")
			router.push("/thank-you")
			reset()
			dispatch({ type: "CLEAR_CART" })
		} catch {
			toast.error("Błąd przy stworzeniu zamówienia.")
		} finally {
			setIsLoading(false)
		}
	}

	/**
	 * Called when form validation fails.
	 * Focuses or scrolls to the first relevant error field
	 * and displays a toast.
	 */
	const onInvalid = (formErrors: typeof errors) => {
		const fieldOrder: (keyof DeliveryFormData)[] = [
			"name",
			"phone",
			"city",
			"postalCode",
			"street",
			"buildingNumber",
			"paymentMethod",
		]

		const errorFields = Object.keys(formErrors) as (keyof DeliveryFormData)[]
		for (const fieldName of fieldOrder) {
			if (errorFields.includes(fieldName)) {
				if (fieldName === "paymentMethod") {
					paymentMethodRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
				} else {
					setFocus(fieldName)
				}
				break
			}
		}
		toast.error("Sprawdź błędne pola formularza.")
	}

	/**
	 * Checks if address fields form a valid address within delivery area.
	 */
	const verifyAddress = async (): Promise<boolean> => {
		try {
			const { city, postalCode, street, buildingNumber } = getValues()
			const addr = `${street} ${buildingNumber}, ${postalCode} ${city}`
			const coords = await getCoordinates(addr)
			if (!coords) {
				toast.error("Podany adres nie istnieje.")
				return false
			}
			const inArea = await isAddressInDeliveryArea(addr, deliveryZones)
			if (!inArea) {
				toast.warning("Twój adres jest poza obszarem dostawy.")
				return false
			}
			return true
		} catch {
			toast.error("Wystąpił błąd sprawdzenia adresu.")
			return false
		}
	}

	/**
	 * Additional button for checking address on demand.
	 */
	const handleCheckDeliveryAddress = async () => {
		const { city, postalCode, street, buildingNumber } = getValues()
		if (!city || !postalCode || !street || !buildingNumber) {
			toast.error("Wprowadź pełny adres.")
			return
		}
		const addr = `${street} ${buildingNumber}, ${postalCode} ${city}`
		try {
			const coords = await getCoordinates(addr)
			if (!coords) {
				toast.error("Podany adres nie istnieje.")
				return
			}
			const inArea = await isAddressInDeliveryArea(addr, deliveryZones)
			if (!inArea) {
				toast.warning("Twój adres jest poza obszarem dostawy.")
				return
			}
			toast.success("Hura! Twój adres jest w zasięgu naszej dostawy.")
		} catch {
			toast.error("Wystąpił błąd sprawdzenia adresu.")
		}
	}

	/**
	 * Handles promo code application.
	 */
	const handleApplyPromoCode = async () => {
		setDeliveryErrorMessage("")
		setIsLoadingPromoCode(true)
		const code = getValues("promoCode")
		if (!code) {
			setDeliveryErrorMessage("Wprowadź kod promocyjny.")
			setIsLoadingPromoCode(false)
			return
		}
		try {

			const dt = getValues("deliveryTime")
    		const deliveryDate = dt === "asap" ? undefined : (dt as Date).toISOString()

			const foundCode = await trpcContext.client.promoCode.validatePromoCode.query({
				promoCode: code,
				deliveryDate,
			})
			if (foundCode) {
				dispatch({ type: "SET_DELIVERY_METHOD", payload: "DELIVERY" })
				dispatch({
					type: "SET_DELIVERY_DISCOUNT",
					payload: {
						code: foundCode.code,
						discountValue: foundCode.discountValue,
						discountType: foundCode.discountType,
					},
				})
				toast.success(
					`Kod ${code} został zastosowany! Zniżka: ${foundCode.discountValue}${foundCode.discountType === "PERCENTAGE" ? "%" : "zł"
					}.`
				)
				setValue("promoCode", "")
			}
		} catch (err: any) {
			setDeliveryErrorMessage(err.message || "Błąd podczas weryfikacji kodu.")
			toast.error(err.message || "Błąd podczas weryfikacji kodu.")
		} finally {
			setIsLoadingPromoCode(false)
		}
	}

	/**
	 * Updates the debounced address whenever form fields change.
	 */
	const handleAddressChange = () => {
		const { city, postalCode, street, buildingNumber } = getValues()
		if (city && postalCode && street && buildingNumber) {
			const addr = `${street} ${buildingNumber}, ${postalCode} ${city}`
			setFullAddress(addr)
		} else {
			setFullAddress("")
			setDeliveryCoordinates(null)
		}
	}

	/**
	 * Recalculates delivery cost once the address is stable (debounced).
	 */
	useEffect(() => {
		if (!debouncedAddress || !deliveryZones?.length) {
			dispatch({ type: "SET_DELIVERY_COST", payload: null })
			return
		}
		let cancelled = false
		const calcCost = async () => {
			try {
				const coords = await getCoordinates(debouncedAddress)
				if (cancelled) return
				setDeliveryCoordinates(coords)
				const distance = coords ? haversineDistance(RESTAURANT_COORDINATES, coords) / 1000 : -1
				const zone = deliveryZones.find(zone => distance >= zone.minRadius && distance <= zone.maxRadius)
				dispatch({ type: "SET_DELIVERY_COST", payload: zone?.price ?? -1 })
			} catch {
				if (!cancelled) {
					setDeliveryCoordinates(null)
					dispatch({ type: "SET_DELIVERY_COST", payload: -1 })
				}
			}
		}
		void calcCost()
		return () => { cancelled = true }

	}, [debouncedAddress, deliveryZones, dispatch, setDeliveryCoordinates])

	/**
	 * Restores an address from localStorage if available.
	 */
	useEffect(() => {
		const saved = localStorage.getItem("deliveryAddress")
		if (saved) {
			const parts = saved.split(", ")
			if (parts.length >= 3) {
				setValue("city", parts[1].split(" ")[1])
				setValue("postalCode", parts[1].split(" ")[0])
				setValue("street", parts[0].split(" ")[0])
				setValue("buildingNumber", parts[0].split(" ")[1])
			}
		}
	}, [setValue])

	/**
	 * Clears the "nip" field if user unchecks the NIP requirement.
	 */
	useEffect(() => {
		if (!isNipRequired) {
			setValue("nip", "")
		}
	}, [isNipRequired, setValue])

	/**
	 * Changes delivery time field if user picks an option from the time switcher.
	 */
	const handleTimeChange = (option: "asap" | Date) => {
		setValue("deliveryTime", option)
	}

	return (
		<form
			id="deliveryForm"
			onSubmit={handleSubmit(onDeliverySubmit, onInvalid)}
			className="space-y-5"
		>
			<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div>
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
						Termin
					</span>
					<h3 className="font-serif text-2xl font-bold text-secondary">Czas dostawy</h3>
				</div>
				<TimeDeliverySwitcher
					isBreakfast={isBreakfast}
					onTimeChange={handleTimeChange}
					isDelivery
					orderWaitTime={settingsData?.orderWaitTime || 30}
					cartItems={state.items}
				/>
			</section>

			<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div>
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
						Adres
					</span>
					<h3 className="font-serif text-2xl font-bold text-secondary">Dane do dostawy</h3>
				</div>
				<div className="flex flex-col gap-4 w-full">
					<div className="grid w-full gap-4 md:grid-cols-2">
						<div className="w-full flex flex-col">
							<label htmlFor="name" className="text-sm font-medium text-text-secondary mt-2">
								Imię <span className="text-danger">*</span>
							</label>
							<Input
								id="name"
								placeholder="Imię"
								{...register("name")}
								className={`mt-1 h-12 rounded-xl border-slate-200 bg-slate-50/70 ${errors.name ? "border-danger" : ""}`}
							/>
							{errors.name && (
								<p className="text-danger text-sm pt-1">{errors.name.message}</p>
							)}
						</div>

						<div className="w-full flex flex-col">
							<label htmlFor="phone" className="block text-sm font-medium text-text-secondary mt-2">
								Nr telefonu <span className="text-danger">*</span>
							</label>
							<Input
								id="phone"
								placeholder="Numer telefonu"
								{...register("phone")}
								className={`mt-1 h-12 rounded-xl border-slate-200 bg-slate-50/70 ${errors.phone ? "border-danger" : ""}`}
							/>
							{errors.phone && (
								<p className="text-danger text-sm pt-1">{errors.phone.message}</p>
							)}
						</div>
					</div>

					<div className="grid w-full gap-4 md:grid-cols-2">
						<div className="w-full flex flex-col">
							<label htmlFor="city" className="block text-sm font-medium text-text-secondary mt-2">
								Miasto <span className="text-danger">*</span>
							</label>
							<Input
								id="city"
								placeholder="Miasto"
								{...register("city", { onChange: handleAddressChange })}
								className={`mt-1 h-12 rounded-xl border-slate-200 bg-slate-50/70 ${errors.city ? "border-danger" : ""}`}
							/>
							{errors.city && (
								<p className="text-danger text-sm pt-1">{errors.city.message}</p>
							)}
						</div>

						<div className="w-full flex flex-col">
							<label
								htmlFor="postalCode"
								className="block text-sm font-medium text-text-secondary mt-2"
							>
								Kod pocztowy <span className="text-danger">*</span>
							</label>
							<Input
								id="postalCode"
								placeholder="00-000"
								{...register("postalCode", { onChange: handleAddressChange })}
								className={`mt-1 h-12 rounded-xl border-slate-200 bg-slate-50/70 ${errors.postalCode ? "border-danger" : ""}`}
							/>
							{errors.postalCode && (
								<p className="text-danger text-sm pt-1">{errors.postalCode.message}</p>
							)}
						</div>
					</div>

					<div className="w-full flex flex-col">
						<label htmlFor="street" className="block text-sm font-medium text-text-secondary mt-2">
							Ulica <span className="text-danger">*</span>
						</label>
						<Input
							id="street"
							placeholder="Ulica"
							{...register("street", { onChange: handleAddressChange })}
							className={`mt-1 h-12 w-full rounded-xl border-slate-200 bg-slate-50/70 ${errors.street ? "border-danger" : ""}`}
						/>
						{errors.street && (
							<p className="text-danger text-sm pt-1">{errors.street.message}</p>
						)}
					</div>

					<div className="grid w-full gap-4 md:grid-cols-2">
						<div className="w-full flex flex-col">
							<label
								htmlFor="buildingNumber"
								className="mt-2 text-sm font-medium text-text-secondary"
							>
								Nr budynku <span className="text-danger">*</span>
							</label>
							<Input
								id="buildingNumber"
								placeholder="Nr budynku"
								type="string"
								{...register("buildingNumber", { onChange: handleAddressChange })}
								className={`mt-1 h-12 rounded-xl border-slate-200 bg-slate-50/70 ${errors.buildingNumber ? "border-danger" : ""}`}
							/>
							{errors.buildingNumber && (
								<p className="text-danger text-sm pt-1">{errors.buildingNumber.message}</p>
							)}
						</div>

						<div className="w-full flex flex-col">
							<label
								htmlFor="apartment"
								className="mt-2 text-sm font-medium text-text-secondary"
							>
								Nr mieszkania (opcjonalnie)
							</label>
							<Input
								id="apartment"
								placeholder="Nr mieszkania"
								type="number"
								{...register("apartment", {
									valueAsNumber: true,
									onChange: handleAddressChange,
								})}
								className="mt-1 h-12 w-full rounded-xl border-slate-200 bg-slate-50/70"
							/>
							{errors.apartment && (
								<p className="text-danger text-sm pt-1">{errors.apartment.message}</p>
							)}
						</div>
					</div>

					<div className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 xl:h-96">
						<DeliveryMapLoader
							loadingElement={
								<div className="flex gap-2">
									<div className="space-y-4">
										<Skeleton className="w-full h-64" />
									</div>
									<div className="space-y-4">
										<Skeleton className="w-full h-64" />
										<Skeleton className="w-full h-10" />
										<Skeleton className="w-full h-10" />
									</div>
								</div>
							}
						>
							<RestaurantMap
								center={RESTAURANT_COORDINATES}
								zoom={11}
								markers={[RESTAURANT_COORDINATES]}
								deliveryZones={deliveryZones}
								addressMarker={deliveryCoordinates}
								className="w-full h-full"
							/>
						</DeliveryMapLoader>
					</div>

					<div className="w-full flex flex-col">
						<Button
							type="button"
							variant="ghost"
							onClick={handleCheckDeliveryAddress}
							className="h-12 rounded-xl bg-secondary font-bold text-white hover:bg-secondary/90"
							disabled={
								!getValues("city") ||
								!getValues("postalCode") ||
								!getValues("street") ||
								!getValues("buildingNumber")
							}
						>
							Sprawdź adres
						</Button>
					</div>
				</div>
			</section>

			<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div>
					<span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
						Uwagi
					</span>
					<h3 className="font-serif text-2xl font-bold text-secondary">Komentarz do zamówienia</h3>
				</div>
				<Textarea
					id="comment"
					placeholder="Komentarz do zamówienia"
					{...register("comment")}
					className={`min-h-28 rounded-xl border-slate-200 bg-slate-50/70 ${errors.comment ? "border-danger" : ""}`}
				/>
				{errors.comment && (
					<p className="text-danger text-sm pt-1">{errors.comment.message}</p>
				)}
			</section>

			<CheckoutPromoCodeSection<DeliveryFormData>
				form={form}
				onApply={handleApplyPromoCode}
				isLoading={isLoadingPromoCode}
				errorMessage={deliveryErrorMessage}
				discount={state.deliveryDiscount}
				onRemoveDiscount={() => dispatch({ type: "REMOVE_DELIVERY_DISCOUNT" })}
			/>

			<CheckoutNipSection<DeliveryFormData>
				form={form}
				isNipRequired={isNipRequired}
				setIsNipRequired={setIsNipRequired}
			/>

			<div ref={paymentMethodRef}>
				<CheckoutPaymentMethodSection<DeliveryFormData>
					form={form}
					errorMessage={errors.paymentMethod?.message}
				/>
			</div>

			{/* The parent page uses <LoadingButton form="deliveryForm" /> to submit */}
		</form>
	)
}
