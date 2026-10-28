// Reject the credential setup that exposed the old shared Places key.
if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
  throw new Error('Remove NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Use separate restricted browser and server Google Maps keys.')
}
if (process.env.GOOGLE_MAPS_SERVER_API_KEY && process.env.GOOGLE_MAPS_SERVER_API_KEY === process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
  throw new Error('Google Maps browser and server credentials must be different.')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	experimental: {
		serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', 'geoip-lite'],
	},
	images: {
		domains: ['spoko-sopot.r2.cloudflarestorage.com', 'pub-6b43bbf3eb884034863e85b0eefe37a8.r2.dev'],
		minimumCacheTTL: 3600,
	},
}

export default nextConfig
