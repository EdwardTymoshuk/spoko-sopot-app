"use client"

import { Coordinates, haversineDistance } from '@/utils/deliveryUtils'
import { cn } from '@/utils/utils'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useState } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'

interface DeliveryZone {
	minRadius: number
	maxRadius: number
	price: number
}

interface RestaurantMapProps {
	center: Coordinates
	zoom: number
	markers?: Coordinates[]
	deliveryZones?: DeliveryZone[]
	circleOptions?: L.CircleMarkerOptions
	className?: string
	addressMarker?: Coordinates | null
}

const markerIcon = L.icon({
	iconUrl: '/leaflet/marker-icon.png',
	iconRetinaUrl: '/leaflet/marker-icon-2x.png',
	shadowUrl: '/leaflet/marker-shadow.png',
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41],
})

function ZoneClickHandler({
	center,
	deliveryZones,
	onZoneSelected,
}: {
	center: Coordinates
	deliveryZones: DeliveryZone[]
	onZoneSelected: (zone: DeliveryZone | null, position: Coordinates | null) => void
}) {
	useMapEvents({
		click(event) {
			const clicked = { lat: event.latlng.lat, lng: event.latlng.lng }
			const distanceKm = haversineDistance(center, clicked) / 1000
			const foundZone = deliveryZones.find(
				(zone) => distanceKm >= zone.minRadius && distanceKm <= zone.maxRadius
			)
			onZoneSelected(foundZone ?? null, foundZone ? clicked : null)
		},
	})
	return null
}

const RestaurantMap: React.FC<RestaurantMapProps> = ({
	center,
	zoom,
	markers = [],
	deliveryZones = [],
	circleOptions,
	className = '',
	addressMarker,
}) => {
	const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null)
	const [infoPosition, setInfoPosition] = useState<Coordinates | null>(null)

	const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_BROWSER_KEY

	if (!apiKey) {
		return (
			<div className={cn('flex h-full min-h-[200px] w-full items-center justify-center p-6 text-center text-sm text-slate-600', className)}>
				Mapa jest chwilowo niedostępna. W sprawie dostawy zadzwoń: 530 659 666.
			</div>
		)
	}

	return (
		<div className={cn('h-full w-full', className)}>
			<MapContainer
				center={[center.lat, center.lng]}
				zoom={zoom}
				style={{ width: '100%', height: '100%' }}
			>
				{/* Attribution required by Geoapify's free plan and OpenStreetMap. */}
				<TileLayer
					url={`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${apiKey}`}
					attribution='Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | © OpenStreetMap contributors'
					maxZoom={20}
				/>

				<ZoneClickHandler
					center={center}
					deliveryZones={deliveryZones}
					onZoneSelected={(zone, position) => {
						setSelectedZone(zone)
						setInfoPosition(position)
					}}
				/>

				{markers.map((marker, index) => (
					<Marker key={`restaurant-${index}`} position={[marker.lat, marker.lng]} icon={markerIcon} />
				))}

				{addressMarker && (
					<Marker position={[addressMarker.lat, addressMarker.lng]} icon={markerIcon} />
				)}

				{deliveryZones.map((zone, index) => (
					<Circle
						key={`zone-${index}`}
						center={[center.lat, center.lng]}
						radius={zone.maxRadius * 1000}
						pathOptions={{
							opacity: 0.5,
							weight: 0.3,
							fillColor: '#aad957',
							fillOpacity: 0.1,
							...circleOptions,
						}}
					/>
				))}

				{selectedZone && infoPosition && (
					<Popup
						position={[infoPosition.lat, infoPosition.lng]}
						eventHandlers={{ remove: () => { setSelectedZone(null); setInfoPosition(null) } }}
					>
						<div>
							<h2 className="text-lg text-text-secondary">Koszt dostawy:</h2>
							<p className="text-lg font-bold text-center text-secondary">{selectedZone.price} zł</p>
						</div>
					</Popup>
				)}
			</MapContainer>
		</div>
	)
}

export default RestaurantMap
