import { describe, it, expect } from 'vitest';
import { randomBrowserProfile, randomUserAgent, acceptLanguage, DEFAULT_CHROME_MAJOR } from './user-agent.js';

describe('randomUserAgent', () => {
  it('produces a well-formed Chrome UA string', () => {
    const ua = randomUserAgent();
    expect(ua).toMatch(
      /^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/,
    );
  });

  it('pins the UA to the given Chrome major version', () => {
    expect(randomUserAgent(149)).toContain('Chrome/149.0.0.0');
  });

  it('falls back to the default major version', () => {
    expect(randomUserAgent()).toContain(`Chrome/${DEFAULT_CHROME_MAJOR}.0.0.0`);
  });
});

describe('randomBrowserProfile', () => {
  it('is internally consistent: macOS UA token implies the macOS platform hint', () => {
    // rand at the midpoint selects the second platform (macOS).
    const profile = randomBrowserProfile(149, () => 0.5);
    expect(profile.userAgent).toContain('Macintosh; Intel Mac OS X');
    expect(profile.platform).toBe('macOS');
  });

  it('is deterministic given an injected rand', () => {
    // rand() === 0 selects the first platform, locale, timezone, and viewport.
    const profile = randomBrowserProfile(149, () => 0);
    expect(profile).toEqual({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      platform: 'Windows',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1920, height: 1080 },
    });
  });

  it('only emits known platform hint values', () => {
    for (let index = 0; index < 50; index++) {
      expect(['Windows', 'macOS', 'Linux']).toContain(randomBrowserProfile().platform);
    }
  });

  it('varies across instances', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index++) {
      const p = randomBrowserProfile();
      seen.add(`${p.userAgent}|${p.locale}|${p.timezoneId}|${p.viewport.width}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('acceptLanguage', () => {
  it('appends the base language with a quality value', () => {
    expect(acceptLanguage('en-US')).toBe('en-US,en;q=0.9');
    expect(acceptLanguage('en-GB')).toBe('en-GB,en;q=0.9');
  });

  it('does not duplicate a bare base locale', () => {
    expect(acceptLanguage('en')).toBe('en;q=0.9');
  });
});
