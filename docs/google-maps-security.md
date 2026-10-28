# Google Maps credentials after the October 2026 incident

The old shared key has been deleted. Do not restore it or reuse
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY`.

The application defaults to no Google requests until new keys are provisioned.
The map shows a phone contact; address endpoints return 503 without a server key.

## Separate credentials (restrictions must be saved before deployment)

- `GOOGLE_MAPS_SERVER_API_KEY`: server-only. Restrict to the VPS's actual outbound
  public IP (verify it; currently the host is 57.128.251.48) and only Geocoding API
  and Places API for address autocomplete. Never add this key to any NEXT_PUBLIC
  variable. Upstream calls allow only geocode and autocomplete, never Text Search.
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`: intentionally public Maps JavaScript key.
  Restrict to Maps JavaScript API only and website referrers
  `https://order.spokosopot.pl/*`, `https://admin.spokosopot.pl/*`.
  Do not authorize Places API or Geocoding API for this key.
- Configure Google Cloud quotas for each enabled API as an independent cost cap.
  The app's budget does not cover browser map loads or direct use of a stolen key.

## Public address API protection

`/api/geocode` and `/api/address-suggestions` use a shared filesystem budget:
250 upstream attempts/day UTC, 30/min total and 10/min per client. Both PM2
processes MUST use the same `GOOGLE_MAPS_USAGE_DIR` outside the deployment tree
(e.g. `/home/debian/.local/state/spoko-google-maps`). `GOOGLE_MAPS_DAILY_LIMIT`
can override the daily cap. Limits bound requests, not a guaranteed PLN amount.

Nginx must overwrite X-Real-IP with the actual client address. Origin/Referer checks
are supplementary and not authentication. A global cap still applies if an IP
header is spoofed. Storage errors and lock contention deny requests. A process
crash while holding the lock requires operator review and removal of the stale
`lock` directory, with both processes stopped; never delete usage.json to bypass
the daily cap. Multiple hosts would require a central shared budget store.

Upstream errors, URLs and credentials must not be sent to clients or logged.
No addresses or raw client IPs are stored in the budget file.

## Verification

Run `npx tsx --test src/server/google-maps/budget.test.ts`, `npx tsc --noEmit`,
and the production build. Scan `.next/static` for the old and server keys without
printing the values. Verify disabled endpoints return 503 and make no upstream
calls. Do not test a billable Google endpoint with the old credential.
