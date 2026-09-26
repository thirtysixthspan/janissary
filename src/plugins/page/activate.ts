import {
  defineIntents, type TabPluginActivation, type TabPluginServerCapabilities,
} from '../api.js';
import { normalizeWebUrl, rootDomain } from '../../openers/web-target.js';
import {
  isNavigateIntent,
  isPagePayload,
  isSyncIntent,
  type NavigateIntent,
  type PagePayload,
  type SyncIntent,
} from './shared.js';

// A page tab is keyed by the address it shows, so `open <url>` on an address already open focuses
// that tab and a profile entry can name what to reopen. Navigation moves the address, and with it
// the key — `updateTab` re-keys, which is what keeps "the key is what this tab shows" true.
function resolve(target: string): PagePayload | undefined {
  const normalized = normalizeWebUrl(target);
  if ('error' in normalized) return undefined;
  return { url: normalized.url, domain: rootDomain(new URL(normalized.url).hostname) };
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isPagePayload,
    opener: {
      inline: (target, capabilities) => {
        const page = resolve(target);
        if (!page) { capabilities.note(`open: invalid URL "${target}"`); return; }
        capabilities.openOrFocusTab(page.url, () => ({ title: page.domain, payload: page }));
      },
      // The OS browser, not a tab. The two messages are the whole feedback: unlike the inline
      // presentation there is no new tab to be the confirmation.
      external: (target, capabilities) => {
        const page = resolve(target);
        if (!page) { capabilities.note(`open: invalid URL "${target}"`); return; }
        capabilities.note(capabilities.openExternally(page.url)
          ? `Opening ${page.domain} in your browser…`
          : `No browser available. The address is ${page.url}`);
      },
    },
    intent: defineIntents('page', isPagePayload, {
      // An address typed into the header. An unviewable scheme or a malformed address is an ordinary
      // domain outcome, not a bad request: the tab simply stays where it is.
      navigate: {
        payload: isNavigateIntent,
        run: (current, payload: NavigateIntent, capabilities) => {
          navigate(current, payload.url, capabilities);
          return null;
        },
      },
      // One relay from the embedded page: the visible text a monitor watching this tab feeds on, plus
      // the address the page is actually on. The address is applied first, so the snapshot is cached
      // against the key the tab ends the call holding.
      sync: {
        payload: isSyncIntent,
        run: (current, payload: SyncIntent, capabilities) => {
          const moved = navigate(current, payload.url, capabilities);
          capabilities.snapshotTab(moved?.url ?? current.url, payload.text);
          return null;
        },
      },
    }),
  };
}

// Point the tab at another address, keeping everything else about it — label position, group, and
// the mounted view — exactly where it was.
function navigate(
  current: PagePayload, target: string, capabilities: TabPluginServerCapabilities,
): PagePayload | undefined {
  const page = resolve(target);
  if (!page || page.url === current.url) return undefined;
  capabilities.updateTab(current.url, () => ({
    instanceKey: page.url, title: page.domain, payload: page,
  }));
  return page;
}
