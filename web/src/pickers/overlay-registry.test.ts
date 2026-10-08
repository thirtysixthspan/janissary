import { afterEach, describe, expect, it } from 'vitest';
import {
  OVERLAYS, buildOverlayOpenState, commandBarSuppressed, firstOpenOverlay,
  type OverlayName, type OverlayOpenSources, type OverlayOpenState,
} from './overlay-registry';
import {
  closeContributedOverlay, contributedOverlayOnScreen, openContributedOverlay, registerContributedOverlay,
} from '../shared/contributed-overlays';

const NONE: OverlayOpenState = {
  syntaxTheme: false, appTheme: false, quickOpen: false,
  tabNav: false, history: false, queue: false, task: false, profile: false,
};

const opened = (...names: OverlayName[]): OverlayOpenState => ({
  ...NONE, ...Object.fromEntries(names.map((name) => [name, true])),
});

describe('the overlay registry', () => {
  // The order itself is the thing three consumers used to restate, so it is asserted here rather
  // than left implicit — reordering an overlay is a deliberate change to this list.
  it('lists every overlay once, in priority order', () => {
    expect(OVERLAYS.map((overlay) => overlay.name)).toEqual([
      'syntaxTheme', 'appTheme', 'quickOpen',
      'tabNav', 'history', 'queue', 'task', 'profile',
    ]);
    expect(new Set(OVERLAYS.map((overlay) => overlay.name)).size).toBe(OVERLAYS.length);
  });

  it('covers exactly the keys of the open state', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(OVERLAYS.map((overlay) => overlay.name).toSorted(byName)).toEqual(Object.keys(NONE).toSorted(byName));
  });
});

const CLOSED: OverlayOpenSources = {
  themePickerOpen: false, appThemePickerOpen: false, quickOpenOpen: false,
  navOpen: false, pickerOpen: false, queueOpen: false, taskPickerOpen: false, profilePickerOpen: false,
};

// Each app-level state name paired with the overlay it is supposed to open. The mapping used to be
// spelled out at every site that asked the registry a question; this is the one that remains.
const SOURCE_OF: ReadonlyArray<[keyof OverlayOpenSources, OverlayName]> = [
  ['themePickerOpen', 'syntaxTheme'],
  ['appThemePickerOpen', 'appTheme'],
  ['quickOpenOpen', 'quickOpen'],
  ['navOpen', 'tabNav'],
  ['pickerOpen', 'history'],
  ['queueOpen', 'queue'],
  ['taskPickerOpen', 'task'],
  ['profilePickerOpen', 'profile'],
];

describe('buildOverlayOpenState', () => {
  it('reports every overlay closed when no picker state is set', () => {
    expect(buildOverlayOpenState(CLOSED)).toEqual(NONE);
  });

  it.each(SOURCE_OF)('maps %s onto the %s overlay and nothing else', (source, name) => {
    expect(buildOverlayOpenState({ ...CLOSED, [source]: true })).toEqual(opened(name));
  });

  it('covers every overlay the registry lists', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(SOURCE_OF.map(([, name]) => name).toSorted(byName)).toEqual(
      OVERLAYS.map((overlay) => overlay.name).toSorted(byName),
    );
  });
});

describe('firstOpenOverlay', () => {
  it('is undefined when nothing is open', () => {
    expect(firstOpenOverlay(NONE)).toBeUndefined();
  });

  it.each(OVERLAYS.map((overlay) => overlay.name))('returns %s when it is the only one open', (name) => {
    expect(firstOpenOverlay(opened(name))).toBe(name);
  });

  it('returns the highest-priority overlay when several are open', () => {
    expect(firstOpenOverlay(opened('profile', 'quickOpen', 'history'))).toBe('quickOpen');
    expect(firstOpenOverlay(opened('profile', 'task'))).toBe('task');
  });
});

describe('commandBarSuppressed', () => {
  it('is false when nothing is open', () => {
    expect(commandBarSuppressed(NONE)).toBe(false);
  });

  // The queue is the one overlay whose selected command is edited in the command bar itself, so
  // suppressing the bar for it would make the popup read-only.
  it('is false for the queue picker alone', () => {
    expect(commandBarSuppressed(opened('queue'))).toBe(false);
  });

  it.each(OVERLAYS.filter((overlay) => overlay.name !== 'queue').map((overlay) => overlay.name))(
    'is true while %s is open',
    (name) => { expect(commandBarSuppressed(opened(name))).toBe(true); },
  );
});

// A contributed overlay ranks after every built-in one, so the eight core answers are unchanged and
// only the two that have to know about a plugin consult the seam.
describe('a plugin-contributed overlay', () => {
  const registrations: (() => void)[] = [];
  afterEach(() => { while (registrations.length > 0) registrations.pop()?.(); });

  const publish = (name: string, claimsCommandBar = true) => {
    registrations.push(registerContributedOverlay(
      { name, claimsCommandBar, render: () => null, onKey: () => {}, onOpen: () => {} },
    ));
  };

  it('does not change what the core registry reports', () => {
    publish('clipboard-history');
    openContributedOverlay('clipboard-history', null);
    expect(firstOpenOverlay(opened())).toBeUndefined();
    expect(firstOpenOverlay(opened('history'))).toBe('history');
  });

  it('claims the command bar while it is open, on its own bit', () => {
    publish('clipboard-history');
    expect(commandBarSuppressed(opened())).toBe(false);
    openContributedOverlay('clipboard-history', null);
    expect(commandBarSuppressed(opened())).toBe(true);
    closeContributedOverlay('clipboard-history');
    expect(commandBarSuppressed(opened())).toBe(false);
  });

  it('answers with its own name once no built-in overlay is up', () => {
    publish('clipboard-history');
    openContributedOverlay('clipboard-history', null);
    expect(contributedOverlayOnScreen()?.name).toBe('clipboard-history');
  });
});
