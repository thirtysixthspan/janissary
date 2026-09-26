import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { PickerOverlays } from './PickerOverlays';
import type { PickerOverlayView } from './picker/overlay-view';
import type { OverlayName, OverlayOpenState } from './overlay-registry';
import type { TabView } from '@shared/protocol';

// Which overlay wins is decided by `firstOpenOverlay` from the one ordered registry, not here — so
// what this component owes its callers is that every overlay in that registry has a case, and that
// the one it renders is the one the registry names. Four of the nine cases had no test at all, so
// adding a tenth overlay to the registry would have compiled and then rendered nothing.

const NAMES: OverlayName[] = ['route', 'syntaxTheme', 'appTheme', 'quickOpen', 'tabNav', 'history', 'queue', 'task', 'profile'];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function overlays(open: OverlayName[]): OverlayOpenState {
  return Object.fromEntries(NAMES.map((name) => [name, open.includes(name)])) as OverlayOpenState;
}

function tab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'deploy', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  } as TabView;
}

function view(overrides: Partial<PickerOverlayView> = {}): PickerOverlayView {
  return {
    overlays: overlays([]),
    route: null,
    routeIndex: 0,
    onPickRoute: vi.fn(),
    syntaxTheme: 'nord',
    themePickerIndex: 0,
    onPickTheme: vi.fn(),
    theme: 'dark',
    appThemePickerIndex: 0,
    onPickAppTheme: vi.fn(),
    recent: ['git status'],
    pickerIndex: 0,
    onPickHistory: vi.fn(),
    navQuery: '',
    navIndex: 0,
    tabs: [tab()],
    onPickTab: vi.fn(),
    queueItems: ['deploy the thing'],
    queueIndex: 0,
    onSelectQueue: vi.fn(),
    taskRows: [{ path: 'src', name: 'src', depth: 0, dir: true, source: 'project' }],
    taskPickerIndex: 0,
    onPickTask: vi.fn(),
    onToggleTaskDir: vi.fn(),
    profiles: [{ name: 'work', source: 'project' }],
    profilePickerIndex: 0,
    onPickProfile: vi.fn(),
    quickOpenQuery: '',
    onChangeQuickOpenQuery: vi.fn(),
    quickOpenResults: [],
    quickOpenIndex: 0,
    onChangeQuickOpenIndex: vi.fn(),
    quickOpenLoading: false,
    onPickQuickOpen: vi.fn(),
    onCloseQuickOpen: vi.fn(),
    commandInputRef: { current: null },
    ...overrides,
  } as PickerOverlayView;
}

function renderOverlay(overrides: Partial<PickerOverlayView> = {}) {
  return render(React.createElement(PickerOverlays, view(overrides)));
}

describe('PickerOverlays', () => {
  it('renders nothing when no overlay is open', () => {
    const { container } = renderOverlay();
    expect(container.textContent).toBe('');
  });

  it.each([
    ['appTheme', /theme/i],
    ['tabNav', /deploy/],
    ['task', /src/],
    ['profile', /work/],
  ] as const)('renders the %s overlay the registry names', (name, expected) => {
    const { container } = renderOverlay({ overlays: overlays([name]) });
    expect(container.textContent).toMatch(expected);
  });

  it.each([
    ['route', /profile list/],
    ['syntaxTheme', /nord/i],
    ['quickOpen', /type to search/i],
    ['history', /git status/],
    ['queue', /deploy the thing/],
  ] as const)('renders the %s overlay the registry names', (name, expected) => {
    const { container } = renderOverlay({
      overlays: overlays([name]),
      route: { cmd: 'profile list', choices: ['project', 'janissary'] },
    });
    expect(container.textContent).toMatch(expected);
  });

  // The registry's order is the keyboard priority chain, so when two are somehow open the earlier
  // one wins here too — the component must not decide precedence for itself.
  it('renders only the first open overlay when two are up', () => {
    const { container } = renderOverlay({
      overlays: overlays(['tabNav', 'queue']),
      route: { cmd: 'profile list', choices: ['project'] },
    });

    expect(container.textContent).toMatch(/deploy/);
    expect(container.textContent).not.toMatch(/deploy the thing/);
  });

  it('renders the route chooser from the view field rather than from the overlay flag', () => {
    const { container } = renderOverlay({
      overlays: overlays(['route']),
      route: { cmd: 'harness launch', choices: ['claude', 'codex'] },
    });

    expect(container.textContent).toMatch(/harness launch/);
    expect(container.textContent).toMatch(/claude/);
  });
});
