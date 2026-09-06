// The fixed loopback port band every e2e browser server binds inside, and the profile clause that
// denies all of it to every confined workspaced spawn.
//
// A Seatbelt profile is fixed for the life of the process it wraps, so a parameter bound at spawn
// time from one browser's port can only ever deny that browser — never one started afterwards, and
// never one belonging to another tab. Denying the set statically is what makes the boundary hold for
// every browser at once, and that requires the set to be known without reference to any launch.
//
// The band sits at the tail of the dynamic range (see `src/browser/e2e-ports.ts`) so the ports left
// over for guards stay one contiguous interval rather than two. It is small on purpose: it caps how
// many browsers can run at once, and it costs one profile clause per port.

export const BROWSER_PORT_BAND_FIRST = 65_280;
export const BROWSER_PORT_BAND_COUNT = 256;
export const BROWSER_PORT_BAND_LAST = BROWSER_PORT_BAND_FIRST + BROWSER_PORT_BAND_COUNT - 1;

export function isBrowserBandPort(port: number): boolean {
  return port >= BROWSER_PORT_BAND_FIRST && port <= BROWSER_PORT_BAND_LAST;
}

// One filter per port, enumerated, because Seatbelt's `remote ip` filter takes a single host and
// port with no range syntax. The two compact alternatives are both wrong: `localhost:*` would deny a
// harness every loopback service including the dev server it exists to test, and moving browsers to
// a second loopback address (127.0.0.2, denied as a whole) needs an `ifconfig` alias the host does
// not have by default.
const bandFilters = Array.from(
  { length: BROWSER_PORT_BAND_COUNT },
  (_, offset) => `  (remote ip "localhost:${BROWSER_PORT_BAND_FIRST + offset}")`,
).join('\n');

export const BROWSER_PORT_BAND_DENY = `; Every e2e browser binds its private Playwright port inside this band, and Playwright serves its
; own websocket path from an unauthenticated discovery route on that port. Deny the whole band last,
; after the general network rule, so no confined harness can reach any browser — its own tab's or
; another tab's — and the protocol guard is the only transport route. Applied to every workspaced
; spawn rather than only browser-enabled ones: a harness with no browser of its own could otherwise
; reach every browser on the host.
(deny network-outbound
${bandFilters})`;
