import { vi } from 'vitest';
import { createRef } from 'react';
import type { TabView } from '@shared/protocol';
import { buildOverlayOpenState } from './overlay-registry';
import type { PickerOverlaysState } from './picker-overlays-state';

// A `PickerOverlaysState` in which every field holds a value distinct from every other field of the
// same type, so the two projections built from it (`buildPickerOverlayView`, `buildPickerKeyBindings`)
// cannot pass by reading the wrong source and landing on an equal value. Every index differs, every
// list differs, and every callback is its own spy.
//
// Every overlay is left open at once — a state the application never reaches, chosen here so no
// assertion passes by reading a flag that happened to be false, and so `overlays` below stays
// consistent with the nine flags rather than being a fourth hand-written literal.
//
// Test support only — nothing in the application imports this module.
export function pickerStateFixture(): PickerOverlaysState {
  const tab = (label: string): TabView => ({ label, cwd: '/w', bufferLines: [], cmdHistory: [], commandQueue: [] } as unknown as TabView);
  const route = { cmd: 'run', choices: ['shell', 'acp'] };
  return {
    route,
    setRoute: vi.fn(), routeIndex: 1, setRouteIndex: vi.fn(),
    routeRef: createRef(), chooseRoute: vi.fn(),

    themePickerOpen: true, themePickerIndex: 2, setThemePickerIndex: vi.fn(), setThemePickerOpen: vi.fn(),
    openThemePicker: vi.fn(), pickTheme: vi.fn(),

    theme: 'midnight', setTheme: vi.fn(),
    appThemePickerOpen: true, appThemePickerIndex: 3,
    setAppThemePickerIndex: vi.fn(), setAppThemePickerOpen: vi.fn(),
    openAppThemePicker: vi.fn(), pickAppTheme: vi.fn(),

    pickerOpen: true, pickerIndex: 4, setPickerIndex: vi.fn(), setPickerOpen: vi.fn(),
    openPicker: vi.fn(), pick: vi.fn(),

    navOpen: true, navQuery: 'nav-query', navIndex: 5, navTabs: [{ tab: tab('nav-tab'), index: 0 }],
    setNavIndex: vi.fn(), setNavQuery: vi.fn(), setNavOpen: vi.fn(),
    openTabNav: vi.fn(), openTabNavWithQuery: vi.fn(), selectNavTab: vi.fn(),

    quickOpenOpen: true, quickOpenQuery: 'quick-query', quickOpenIndex: 6, quickOpenLoading: true,
    quickOpenResults: [{ path: 'a/b.ts', index: 0, score: 1, ranges: [] }],
    setQuickOpenQuery: vi.fn(), setQuickOpenIndex: vi.fn(), setQuickOpenOpen: vi.fn(),
    openQuickOpen: vi.fn(), closeQuickOpen: vi.fn(), pickQuickOpenFile: vi.fn(),

    queueOpen: true, queueIndex: 7, setQueueIndex: vi.fn(), setQueueOpen: vi.fn(),
    openQueue: vi.fn(), selectQueueIndex: vi.fn(), onEditQueued: vi.fn(), onDeleteQueued: vi.fn(),

    taskPickerOpen: true, taskPickerIndex: 8, setTaskPickerIndex: vi.fn(), setTaskPickerOpen: vi.fn(),
    openTaskPicker: vi.fn(), pickTask: vi.fn(), toggleTaskDir: vi.fn(),
    visibleTasks: [{ path: 'task.md', name: 'task', source: 'project', depth: 0, dir: false }],

    profilePickerOpen: true, profilePickerIndex: 9, setProfilePickerIndex: vi.fn(), setProfilePickerOpen: vi.fn(),
    openProfilePicker: vi.fn(), pickProfile: vi.fn(),
    visibleProfiles: [{ name: 'profile', source: 'project' }],

    syntaxTheme: 'monokai', runCommand: vi.fn(),
    recent: ['recent-command'], queueItems: ['queued-command'], tabs: [tab('open-tab')],
    commandInputRef: createRef(),
    overlays: buildOverlayOpenState({
      route, themePickerOpen: true, appThemePickerOpen: true, quickOpenOpen: true, navOpen: true,
      pickerOpen: true, queueOpen: true, taskPickerOpen: true, profilePickerOpen: true,
    }),
  };
}
