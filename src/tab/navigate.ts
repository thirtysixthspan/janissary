import type { Tab } from '../types.js';
import { normalizeWebUrl, rootDomain } from '../openers/page.js';

// Navigates an existing page tab to a new address in place, keeping its page number and tab
// identity. Mirrors the `open`/`open page` normalization (scheme rejection, bare-target https
// default) so a manually-typed address behaves the same way here as it does through `open`.
// Returns true when the URL was valid and applied (mutating `tab.page` and `tab.title` to the
// new address/domain), false when it was rejected — the caller leaves the tab untouched.
export function navigatePageTab(tab: Tab, target: string): boolean {
  if (!tab.page) return false;
  const normalized = normalizeWebUrl(target);
  if ('error' in normalized) return false;
  const domain = rootDomain(new URL(normalized.url).hostname);
  tab.page = { ...tab.page, url: normalized.url, domain };
  tab.title = domain;
  return true;
}
