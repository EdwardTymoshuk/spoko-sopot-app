// Reject the credential setup that exposed the old shared Google Places key.
// Google Maps has been replaced by Geoapify; these variables must never come back.
if (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
  throw new Error('Remove all GOOGLE_MAPS_* variables. This app uses GEOAPIFY_SERVER_API_KEY and NEXT_PUBLIC_GEOAPIFY_BROWSER_KEY.')
}
if (process.env.GEOAPIFY_SERVER_API_KEY && process.env.GEOAPIFY_SERVER_API_KEY === process.env.NEXT_PUBLIC_GEOAPIFY_BROWSER_KEY) {
  throw new Error('Geoapify browser and server credentials must be different.')
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
