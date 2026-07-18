# Double-click the page tab's URL to edit and navigate

**Complexity: 4/10** — a new client→server RPC (`navigatePage`) threaded through the standard protocol/message-handler/controller/tab-manager chain, a small pure validation helper reusing the existing `open`-command URL normalization, and an inline-edit UI mirroring the tab-rename pattern already in `TabItem.tsx`.

## Goal

Per the backlog: "double clicking the url in the metadata row of the browser tab allows the user to edit the address, and the address is then loaded once enter/return is pressed." Currently `web/src/PageTab.tsx`'s `.page-url` span is plain, read-only text.

## Background (verified)

- `src/types.ts:82` — `PageView = { url: string; domain: string; number: number }`.
- `src/tab/creators.ts:90-103` `addPageTab` sets the tab's internal `label` to `page-<number>` (stable, never shown) and `tab.title = page.domain` (the tab-strip display name) at creation — there is currently no in-place update path for either.
- `src/openers/page.ts` already has `normalizeWebUrl` (rejects non-http(s) schemes, defaults a bare target to `https://`, returns `{ url }` or `{ error }`) and `rootDomain` (registrable-domain extraction for the label) — exactly what's needed to validate a manually-typed address the same way `open`/`open page` does.
- `TabItem.tsx`'s double-click-to-rename pattern (`startEdit`/`commit`/`cancel`, a `cancelledRef` to suppress the blur-triggered commit after Escape) is the established inline-edit convention to mirror.
- `src/protocol.ts`, `src/message-handler.ts`, `src/controller.ts`, `src/tab/manager.ts` already have a `renameTab` RPC end-to-end — the structural template for a new `navigatePage` RPC (same `{ index, <payload> }` shape, same dispatch/controller/manager layering).
- `src/tab/manager.ts` is close to the 200-significant-line limit; new logic goes in a new small pure module (`src/tab/navigate.ts`) rather than growing `manager.ts` inline, mirroring how `transcript-ops.ts`/`reorder.ts`/etc. are already split out and called from `TabManager` methods.

## Approach

Add a `navigatePage(index, url)` RPC that validates/normalizes the target the same way `open` does, then updates the target page tab's `page.url`/`page.domain` and `tab.title` in place (keeping its page number, position, and group). The client renders an inline `<input>` in place of `.page-url` on double-click; Enter (via blurring the input) or blur commits, Escape cancels — the same interaction shape as tab renaming.

## Implementation steps

1. **`src/tab/navigate.ts`** (new file) — pure helper:
   ```ts
   import type { Tab } from '../types.js';
   import { normalizeWebUrl, rootDomain } from '../openers/page.js';

   export function navigatePageTab(tab: Tab, target: string): boolean {
     if (!tab.page) return false;
     const normalized = normalizeWebUrl(target);
     if ('error' in normalized) return false;
     const domain = rootDomain(new URL(normalized.url).hostname);
     tab.page = { ...tab.page, url: normalized.url, domain };
     tab.title = domain;
     return true;
   }
   ```
2. **`src/tab/manager.ts`** — import `navigatePageTab` and add:
   ```ts
   navigatePage(index: number, url: string): void {
     const tab = this.tabs[index];
     if (!tab || !navigatePageTab(tab, url)) return;
     messageBus.emit('state', { type: 'dirty' });
   }
   ```
3. **`src/protocol.ts`** — add to `RpcCall`:
   ```ts
   | { method: 'navigatePage'; params: { index: number; url: string } }
   ```
4. **`src/controller.ts`** — add, alongside `renameTab`:
   ```ts
   navigatePage(index: number, url: string): void {
     this.managers.tab.navigatePage(index, url);
   }
   ```
5. **`src/message-handler.ts`** — add a `case 'navigatePage'` dispatching to `controller.navigatePage(...)`, mirroring `renameTab`'s case.
6. **`web/src/ws.ts`** — add a `navigatePage(index, url)` convenience method on `JanusClient`, mirroring `renameTab`.
7. **`web/src/PageTab.tsx`** — add `editing`/`draft` state and a `cancelledRef`, plus `startEdit`/`commit`/`cancel` handlers (mirroring `TabItem.tsx`). Render an `<input className="page-url-input">` in place of `.page-url` while editing; `onDoubleClick` on the `.page-url` span starts editing. Commit calls `client.navigatePage(index, draft.trim())` when the trimmed draft is non-empty and different from the current URL.
8. **`web/src/theme.css`** — add a `.page-url-input` rule mirroring `.tab-rename-input` (transparent, inherits font/color, no border/outline).

## Tests

**Server** — new `src/tab/navigate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { navigatePageTab } from './navigate.js';
import { makePageTab } from './index.js';

describe('navigatePageTab', () => {
  it('updates url, domain, and title for a valid address', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    expect(navigatePageTab(tab, 'new.com/path')).toBe(true);
    expect(tab.page).toEqual({ url: 'https://new.com/path', domain: 'new.com', number: 1 });
    expect(tab.title).toBe('new.com');
  });

  it('rejects an invalid scheme and leaves the tab unchanged', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    expect(navigatePageTab(tab, 'javascript:alert(1)')).toBe(false);
    expect(tab.page?.url).toBe('https://old.com/');
  });

  it('is a no-op for a non-page tab', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    delete tab.page;
    expect(navigatePageTab(tab, 'new.com')).toBe(false);
  });
});
```
Plus `src/message-handler.test.ts`: a `'routes navigatePage'` case mirroring the existing `renameTab` one (add `navigatePage: vi.fn()` to the controller stub and assert `dispatchCall` forwards `{ index, url }`).

**Web** — `web/src/PageTab.test.tsx`:
```ts
it('double-clicking the URL enters edit mode with the current address prefilled', () => {
  const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={makeClient()} />);
  fireEvent.doubleClick(container.querySelector('.page-url') as Element);
  const input = container.querySelector('.page-url-input') as HTMLInputElement;
  expect(input).not.toBeNull();
  expect(input.value).toBe('https://slashdot.org/');
});

it('pressing Enter commits the new address via navigatePage', () => {
  const client = makeClient();
  const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={client} />);
  fireEvent.doubleClick(container.querySelector('.page-url') as Element);
  const input = container.querySelector('.page-url-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(client.navigatePage).toHaveBeenCalledWith(2, 'example.com');
});

it('pressing Escape cancels without navigating', () => {
  const client = makeClient();
  const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={2} client={client} />);
  fireEvent.doubleClick(container.querySelector('.page-url') as Element);
  const input = container.querySelector('.page-url-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'example.com' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(container.querySelector('.page-url-input')).toBeNull();
  expect(client.navigatePage).not.toHaveBeenCalled();
});
```
`makeClient()` in `PageTab.test.tsx` needs `navigatePage: vi.fn()` added to its stub.

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/embedded-web-page.md`'s "Page tab layout" section (metadata bullet) — add a sentence noting the address is editable: double-clicking it opens an inline edit field; the address loads on Enter (or is discarded on blur/Escape unless changed), keeping the page tab's identity, number, and position unchanged. Also update the intro paragraph's navigation-control carve-out (added by the sibling back/forward/reload fix) to mention that a manually-typed address is validated the same way `open`/`open page` validates one.

## Docs

- `documentation/user-documentation/tab-types/web-pages.md` doesn't currently mention the metadata row's address being interactive at all (only that back/forward/reload were just added). Add a short note under "Viewing, not driving" or a new bullet describing double-click-to-edit-and-navigate, since this is new behavior the fix introduces and the surrounding paragraph already documents the metadata row's other controls.

## Out of scope

- Detecting and reflecting URL changes the user makes **inside** the embedded page (the separate "follow the actual url in view" backlog item) — this fix only handles the user explicitly editing the address bar.
- Validating reachability of the target address (DNS, framing headers, etc.) — same as `open`, only scheme/format is validated; an unreachable address simply fails to load in the iframe, same as pasting it into a normal browser.
