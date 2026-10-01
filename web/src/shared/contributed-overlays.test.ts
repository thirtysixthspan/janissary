import { describe, expect, it, vi } from 'vitest';
import {
  closeContributedOverlay, contributedOverlayAnchor, contributedOverlayClaimsCommandBar,
  contributedOverlayOnScreen, contributedOverlays, contributedOverlaysVersion, isContributedOverlayOpen,
  openContributedOverlay, registerContributedOverlay, subscribeContributedOverlays,
} from './contributed-overlays';

// The seam every feature reaches a plugin's overlay through. It exists because the feature-directory
// lint zones forbid `pickers`, `context-menu`, and `agent-tabs` from importing the plugin layer, and
// because a static import of a plugin's chunk would pull it into the entry bundle.

const blank = { claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {} };
const claims = { chords: ['ctrl+shift+v'], command: 'clip' };

function overlay(name: string, overrides: Partial<typeof blank> = {}) {
  return { ...blank, name, ...overrides };
}

describe('the contributed-overlay seam', () => {
  it('publishes an overlay and takes it away again', () => {
    const unregister = registerContributedOverlay(overlay('a'), claims);
    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['a']);
    unregister();
    expect(contributedOverlays()).toEqual([]);
  });

  it('keeps registration order, so two plugins claiming one moment resolve the same way every time', () => {
    registerContributedOverlay(overlay('first'), claims);
    const unregister = registerContributedOverlay(overlay('second'), claims);

    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['first', 'second']);
    unregister();
  });

  it('leaves a later registration in place when an earlier one unsubscribes', () => {
    const first = registerContributedOverlay(overlay('first'), claims);
    registerContributedOverlay(overlay('second'), claims);

    first();

    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['second']);
  });

  it('reports the open one, and nothing when none is', () => {
    const unregister = registerContributedOverlay(overlay('a'), claims);
    expect(contributedOverlayOnScreen()).toBeUndefined();

    openContributedOverlay('a', null);
    expect(contributedOverlayOnScreen()?.name).toBe('a');
    expect(isContributedOverlayOpen('a')).toBe(true);

    closeContributedOverlay('a');
    expect(contributedOverlayOnScreen()).toBeUndefined();
    expect(isContributedOverlayOpen('a')).toBe(false);
    unregister();
  });

  it('calls onOpen when the overlay opens, which is where a plugin resets its selection', () => {
    const onOpen = vi.fn();
    const unregister = registerContributedOverlay(overlay('a', { onOpen }), claims);

    openContributedOverlay('a', null);

    expect(onOpen).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('hands the open route the element the right-click landed on, and forgets it on close', () => {
    const unregister = registerContributedOverlay(overlay('a'), claims);
    const anchor = document.createElement('div');

    expect(contributedOverlayAnchor('a')).toBeNull();
    openContributedOverlay('a', anchor);
    expect(contributedOverlayAnchor('a')).toBe(anchor);
    closeContributedOverlay('a');
    // The menu closes and hands focus back before the popup is on screen, so a stale anchor would
    // send the paste to an element the user has long since left.
    expect(contributedOverlayAnchor('a')).toBeNull();
    unregister();
  });

  it('reports whether an open overlay claims the command bar', () => {
    const quiet = registerContributedOverlay(overlay('quiet', { claimsCommandBar: false }), claims);
    const loud = registerContributedOverlay(overlay('loud'), claims);

    expect(contributedOverlayClaimsCommandBar()).toBe(false);
    openContributedOverlay('loud', null);
    expect(contributedOverlayClaimsCommandBar()).toBe(true);
    closeContributedOverlay('loud');
    openContributedOverlay('quiet', null);
    expect(contributedOverlayClaimsCommandBar()).toBe(false);
    quiet();
    loud();
  });

  it('opens nothing for a name no plugin registered', () => {
    expect(openContributedOverlay('nothing-here', null)).toBe(false);
  });

  // Opening and closing change nothing in React state, so this is what puts the change back in the
  // overlay registry's answer. A stable snapshot is what `useSyncExternalStore` needs.
  it('bumps a stable version and tells its subscribers on every change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContributedOverlays(listener);
    const before = contributedOverlaysVersion();

    const unregister = registerContributedOverlay(overlay('a'), claims);
    expect(contributedOverlaysVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(1);

    openContributedOverlay('a', null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    unregister();
    const after = contributedOverlaysVersion();
    expect(after).toBe(contributedOverlaysVersion());
  });
});
