import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeContributedOverlay, closeContributedOverlays, contributedOverlayAnchor, contributedOverlayFocusOrigin, contributedOverlayClaimsCommandBar,
  contributedOverlayOnScreen, contributedOverlays, contributedOverlaysVersion, declareOverlayClaims,
  installOverlayOpener, isContributedOverlayOpen, openContributedOverlay, openOverlayForChord,
  openOverlayForCommand, overlayClaimedByCommand, registerContributedOverlay,
  subscribeContributedOverlays,
} from './contributed-overlays';

// The seam every feature reaches a plugin's overlay through. It exists because the feature-directory
// lint zones forbid `pickers`, `context-menu`, and `agent-tabs` from importing the plugin layer, and
// because a static import of a plugin's chunk would pull it into the entry bundle.

const blank = { claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {} };
const claims = { chords: ['ctrl+shift+v'], command: 'clip' };

function overlay(name: string, overrides: Partial<typeof blank> = {}) {
  return { ...blank, name, ...overrides };
}

// Every claim and registration published by a test is withdrawn afterwards, since the seam is module
// state shared across the file and a leftover claim would answer for a later test.
const published: (() => void)[] = [];
afterEach(() => { while (published.length > 0) published.pop()?.(); });

function publishClaim(name: string, its: typeof claims = claims) {
  const withdraw = declareOverlayClaims(name, its);
  published.push(withdraw);
  return withdraw;
}
function register(name: string, overrides: Partial<typeof blank> = {}) {
  published.push(registerContributedOverlay(overlay(name, overrides)));
}

describe('the contributed-overlay seam', () => {
  it('publishes an overlay and takes it away again', () => {
    const unregister = registerContributedOverlay(overlay('a'));
    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['a']);
    unregister();
    expect(contributedOverlays()).toEqual([]);
  });

  it('keeps registration order, so two plugins claiming one moment resolve the same way every time', () => {
    registerContributedOverlay(overlay('first'));
    const unregister = registerContributedOverlay(overlay('second'));

    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['first', 'second']);
    unregister();
  });

  it('leaves a later registration in place when an earlier one unsubscribes', () => {
    const first = registerContributedOverlay(overlay('first'));
    registerContributedOverlay(overlay('second'));

    first();

    expect(contributedOverlays().map((entry) => entry.name)).toEqual(['second']);
  });

  // The order a plugin is actually reached in: a host declares how it will be opened before any chunk
  // exists, and only registers the overlay once that chunk has loaded. Routing therefore has to answer
  // from the declaration, or the first chord press finds nothing and the plugin is never activated.
  it('answers a chord and a command word from a declaration, before anything has registered', () => {
    const opened: [string, HTMLElement | null][] = [];
    const uninstall = installOverlayOpener((name, anchor) => { opened.push([name, anchor]); });
    publishClaim('a');

    expect(openOverlayForChord('ctrl+shift+v')).toBe(true);
    expect(openOverlayForCommand('clip', null)).toBe(true);
    expect(openOverlayForCommand('CLIP', null)).toBe(true);
    expect(opened.map(([name]) => name)).toEqual(['a', 'a', 'a']);

    uninstall();
  });

  it('stops answering once a declaration is withdrawn', () => {
    const uninstall = installOverlayOpener(() => {});
    const withdraw = declareOverlayClaims('a', claims);
    expect(overlayClaimedByCommand('clip')).toBe(true);

    withdraw();

    expect(overlayClaimedByCommand('clip')).toBe(false);
    expect(openOverlayForChord('ctrl+shift+v')).toBe(false);
    expect(openOverlayForCommand('clip', null)).toBe(false);
    uninstall();
  });

  it('leaves a later declaration in place when an earlier one withdraws', () => {
    const first = publishClaim('a');
    publishClaim('b');
    const opened: string[] = [];
    const uninstall = installOverlayOpener((name) => { opened.push(name); });

    first();
    openOverlayForChord('ctrl+shift+v');

    expect(opened).toEqual(['b']);
    uninstall();
  });

  it('resolves two plugins declaring one chord in declaration order', () => {
    const opened: string[] = [];
    const uninstall = installOverlayOpener((name) => { opened.push(name); });
    publishClaim('first');
    publishClaim('second');

    openOverlayForChord('ctrl+shift+v');

    expect(opened).toEqual(['first']);
    uninstall();
  });

  it('opens nothing when no plugin declared the word, and says so synchronously', () => {
    const uninstall = installOverlayOpener(() => {});

    expect(overlayClaimedByCommand('clip')).toBe(false);
    expect(openOverlayForCommand('clip', null)).toBe(false);

    uninstall();
  });

  it('reports the open one, and nothing when none is', () => {
    register('a');
    expect(contributedOverlayOnScreen()).toBeUndefined();

    openContributedOverlay('a', null);
    expect(contributedOverlayOnScreen()?.name).toBe('a');
    expect(isContributedOverlayOpen('a')).toBe(true);

    closeContributedOverlay('a');
    expect(contributedOverlayOnScreen()).toBeUndefined();
    expect(isContributedOverlayOpen('a')).toBe(false);
  });

  it('calls onOpen when the overlay opens, which is where a plugin resets its selection', () => {
    const onOpen = vi.fn();
    register('a', { onOpen });

    openContributedOverlay('a', null);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hands the open route the element the right-click landed on, and forgets it on close', () => {
    register('a');
    const anchor = document.createElement('div');

    expect(contributedOverlayAnchor('a')).toBeNull();
    openContributedOverlay('a', anchor);
    expect(contributedOverlayAnchor('a')).toBe(anchor);
    closeContributedOverlay('a');
    // The menu closes and hands focus back before the popup is on screen, so a stale anchor would
    // send the paste to an element the user has long since left.
    expect(contributedOverlayAnchor('a')).toBeNull();
  });

  it('reports whether an open overlay claims the command bar', () => {
    register('quiet', { claimsCommandBar: false });
    register('loud');

    expect(contributedOverlayClaimsCommandBar()).toBe(false);
    openContributedOverlay('loud', null);
    expect(contributedOverlayClaimsCommandBar()).toBe(true);
    closeContributedOverlay('loud');
    openContributedOverlay('quiet', null);
    expect(contributedOverlayClaimsCommandBar()).toBe(false);
  });

  it('closes whichever overlay is open, forgetting its anchor, and tells subscribers', () => {
    register('a');
    openContributedOverlay('a', document.createElement('div'));
    const listener = vi.fn();
    const unsubscribe = subscribeContributedOverlays(listener);

    closeContributedOverlays();

    expect(contributedOverlayOnScreen()).toBeUndefined();
    expect(contributedOverlayAnchor('a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifies nobody when closing all finds nothing open', () => {
    register('a');
    const before = contributedOverlaysVersion();

    closeContributedOverlays();

    expect(contributedOverlaysVersion()).toBe(before);
  });

  // The overlay takes the keyboard once it is on screen, so where the user was typing has to be read as
  // it opens. That element is both where a paste lands and where focus goes back to.
  describe('the keyboard it takes and gives back', () => {
    function field(): HTMLTextAreaElement {
      const element = document.createElement('textarea');
      document.body.append(element);
      published.push(() => { element.remove(); });
      return element;
    }
    function popup(): HTMLDivElement {
      const element = document.createElement('div');
      element.tabIndex = -1;
      document.body.append(element);
      published.push(() => { element.remove(); });
      return element;
    }

    it('records the element that held the keyboard as the overlay opened', () => {
      register('a');
      const origin = field();
      origin.focus();

      openContributedOverlay('a', null);
      popup().focus();

      expect(contributedOverlayFocusOrigin()).toBe(origin);
      closeContributedOverlay('a');
      expect(contributedOverlayFocusOrigin()).toBeNull();
    });

    it('gives the keyboard back to that element when the plugin closes', () => {
      register('a');
      const origin = field();
      origin.focus();
      openContributedOverlay('a', null);
      popup().focus();

      closeContributedOverlay('a');

      expect(document.activeElement).toBe(origin);
    });

    it('leaves the keyboard in a different field a paste moved it to', () => {
      register('a');
      const origin = field();
      origin.focus();
      openContributedOverlay('a', null);
      const clicked = field();
      clicked.focus();

      closeContributedOverlay('a');

      expect(document.activeElement).toBe(clicked);
    });

    it('does nothing with an origin that has left the document', () => {
      register('a');
      const origin = field();
      origin.focus();
      openContributedOverlay('a', null);
      const holder = popup();
      holder.focus();
      origin.remove();

      closeContributedOverlay('a');

      expect(document.activeElement).toBe(holder);
    });

    it('does not give the keyboard back when every overlay is closed for a tab switch', () => {
      register('a');
      const origin = field();
      origin.focus();
      openContributedOverlay('a', null);
      const holder = popup();
      holder.focus();

      closeContributedOverlays();

      expect(document.activeElement).toBe(holder);
    });

    it('keeps the first origin when an overlay already open is opened again', () => {
      register('a');
      const origin = field();
      origin.focus();
      openContributedOverlay('a', null);
      popup().focus();

      openContributedOverlay('a', null);

      expect(contributedOverlayFocusOrigin()).toBe(origin);
    });
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

    const unregister = registerContributedOverlay(overlay('a'));
    expect(contributedOverlaysVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(1);

    openContributedOverlay('a', null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    unregister();
    const after = contributedOverlaysVersion();
    expect(after).toBe(contributedOverlaysVersion());
  });

  // A claim is not something anything renders, so declaring one must not re-render the shell.
  it('does not bump the version when a claim is declared or withdrawn', () => {
    const before = contributedOverlaysVersion();

    publishClaim('a');

    expect(contributedOverlaysVersion()).toBe(before);
  });
});
