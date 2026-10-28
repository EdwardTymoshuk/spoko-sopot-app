# Geoapify credentials (migrated off Google Maps, October 2026)

Google Maps Platform has been fully replaced by Geoapify (geocoding, address
autocomplete, and map tiles). The old shared Google key was deleted after a
security incident (Google Support case 76985432) and must never be restored.
Do not reuse `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
`GOOGLE_MAPS_SERVER_API_KEY` or `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — the
build fails fast (see `next.config.mjs`) if any of these are still set.

The application defaults to no Geoapify requests until the new keys are
provisioned. The map shows a phone contact; address endpoints return 503
without a server key.

## Separate credentials (restrictions must be saved before deployment)

- `GEOAPIFY_SERVER_API_KEY`: server-only. In the Geoapify project dashboard,
  restrict it by IP to the VPS's actual outbound public IP (verify it;
  currently the host is 57.128.251.48). This key is used only for the
  Geocoding and Address Autocomplete APIs through `/api/geocode` and
  `/api/address-suggestions`. Never add this key to any `NEXT_PUBLIC`
  variable.
- `NEXT_PUBLIC_GEOAPIFY_BROWSER_KEY`: intentionally public, used only for map
  tiles (`https://maps.geoapify.com/v1/tile/...`). Restrict it by HTTP
  referrer/origin in the Geoapify dashboard to
  `https://order.spokosopot.pl/*` and `https://admin.spokosopot.pl/*`.
- Stay on Geoapify's free plan (3000 credits/day, no card required) unless
  explicitly approved otherwise. Geocoding and autocomplete each cost 1
  credit; map tiles cost 0.25 credit. Daily quotas do not roll over.

## Public address API protection

`/api/geocode` and `/api/address-suggestions` use a shared filesystem budget
(`src/server/geoapify/budget.ts`, reused unchanged from the Google-era
implementation — it was already provider-agnostic): 250 upstream
attempts/day UTC, 30/min total and 10/min per client. Both PM2 processes
(`spoko-order`, `spoko-admin`) MUST use the same `GEOAPIFY_USAGE_DIR` outside
the deployment tree (e.g. `/home/debian/.local/state/spoko-geoapify`), since
CI runs `git clean -fd` on every deploy. `GEOAPIFY_DAILY_LIMIT` can override
the daily cap. These limits bound request counts, not a guaranteed credit
amount — map tile loads are not counted here because the browser talks to
Geoapify directly with the referrer-restricted key.

Nginx must overwrite X-Real-IP with the actual client address.
Origin/Referer checks are supplementary and not authentication. A process
crash while holding the lock requires operator review and removal of the
stale `lock` directory, with both processes stopped; never delete
`usage.json` to bypass the daily cap. Multiple hosts would require a central
shared budget store.

Upstream errors, URLs and credentials must not be sent to clients or logged.
No addresses or raw client IPs are stored in the budget file.

## Map tiles and attribution

Map tiles use the `osm-carto` style
(`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png`), which avoids
the extra OpenMapTiles attribution required by other styles. The rendered
map must always show "Powered by Geoapify" and "© OpenStreetMap
contributors" (see the `attribution` prop on the `TileLayer` in
`RestaurantMap.tsx`) — this is required by Geoapify's free plan terms, not
optional branding.

## Verification

Run `npx tsx --test src/server/geoapify/budget.test.ts`, `npx tsc --noEmit`,
and the production build (on Node 20, matching the server — Node 26 fails in
an unrelated logging module). Scan `.next/static` for the old Google key
names and for the server key without printing values. Verify disabled
endpoints return 503 and make no upstream calls. Do not test a billable
Geoapify endpoint beyond what's needed to confirm it works.
