// A randomized-but-coherent browser fingerprint per window (BrowserContext). The point is
// twofold: (1) isolated windows shouldn't share an identical fingerprint, and (2) every
// signal we expose must be internally consistent — a user agent that disagrees with the
// platform, locale, timezone, or client-hint headers is itself a bot tell. So a profile
// bundles the UA string with the matching `Sec-CH-UA-Platform` value, an Accept-Language
// header, a timezone plausible for the platform, and a common desktop viewport.
//
// The Chrome *version* is pinned to the real Chromium build at the call site (passed in as
// `chromeMajor`) so the UA string and the engine-emitted client hints report the same
// version. Only the platform/locale/timezone/viewport are randomized.

import type { BrowserProfile } from './types.js';

const PLATFORMS = [
  {
    token: 'Windows NT 10.0; Win64; x64',
    platform: 'Windows' as const,
    timezones: ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London'],
  },
  {
    token: 'Macintosh; Intel Mac OS X 10_15_7',
    platform: 'macOS' as const,
    timezones: ['America/New_York', 'America/Los_Angeles', 'Europe/London'],
  },
  {
    token: 'X11; Linux x86_64',
    platform: 'Linux' as const,
    timezones: ['Europe/Berlin', 'Europe/Paris', 'America/New_York'],
  },
];

// Common desktop resolutions; nothing exotic that would stand out.
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const LOCALES = ['en-US', 'en-GB'];

// Fallback when the real Chromium version can't be read; kept recent.
export const DEFAULT_CHROME_MAJOR = 149;

function pick<T>(array: T[], rand: () => number): T {
  return array[Math.floor(rand() * array.length)];
}

/**
 * Generate a coherent browser profile. `chromeMajor` should be the real engine's major
 * version so the UA matches the client hints; `rand` is injectable for deterministic tests.
 */
export function randomBrowserProfile(
  chromeMajor: number = DEFAULT_CHROME_MAJOR,
  rand: () => number = Math.random,
): BrowserProfile {
  const p = pick(PLATFORMS, rand);
  const userAgent = `Mozilla/5.0 (${p.token}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
  return {
    userAgent,
    platform: p.platform,
    locale: pick(LOCALES, rand),
    timezoneId: pick(p.timezones, rand),
    viewport: pick(VIEWPORTS, rand),
  };
}

/** Just the UA string from a fresh profile (convenience for callers that only need that). */
export function randomUserAgent(
  chromeMajor: number = DEFAULT_CHROME_MAJOR,
  rand: () => number = Math.random,
): string {
  return randomBrowserProfile(chromeMajor, rand).userAgent;
}

/** Build an `Accept-Language` header value consistent with a profile's locale. */
export function acceptLanguage(locale: string): string {
  const base = locale.split('-', 1)[0];
  return locale === base ? `${locale};q=0.9` : `${locale},${base};q=0.9`;
}
