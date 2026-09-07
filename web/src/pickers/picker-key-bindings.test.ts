import { describe, expect, it } from 'vitest';
import { buildPickerKeyBindings } from './picker-key-bindings';
import { buildOverlayOpenState, OVERLAYS } from './overlay-registry';
import { pickerStateFixture } from './picker-state-test-fixture';

const state = pickerStateFixture();
const keys = buildPickerKeyBindings(state);
const byName = (a: string, b: string) => a.localeCompare(b);

// The nine open/closed values `dispatchModalKey` rebuilds the registry state from. They keep their
// app-level names through the projection, which is what lets the snapshot stay an `OverlayOpenSources`.
const OPEN_STATE: ReadonlyArray<[string, unknown, unknown]> = [
  ['route', keys.route, state.route],
  ['themePickerOpen', keys.themePickerOpen, state.themePickerOpen],
  ['appThemePickerOpen', keys.appThemePickerOpen, state.appThemePickerOpen],
  ['quickOpenOpen', keys.quickOpenOpen, state.quickOpenOpen],
  ['navOpen', keys.navOpen, state.navOpen],
  ['pickerOpen', keys.pickerOpen, state.pickerOpen],
  ['queueOpen', keys.queueOpen, state.queueOpen],
  ['taskPickerOpen', keys.taskPickerOpen, state.taskPickerOpen],
  ['profilePickerOpen', keys.profilePickerOpen, state.profilePickerOpen],
];

// The handlers' `*Idx` vocabulary against the hooks' `*Index`. This translation used to live in the
// deps literal at the call site, where it was written out a second time beside the render props.
const RENAMED: ReadonlyArray<[string, unknown, unknown]> = [
  ['routeIdx', keys.routeIdx, state.routeIndex],
  ['pickerIdx', keys.pickerIdx, state.pickerIndex],
  ['themePickerIdx', keys.themePickerIdx, state.themePickerIndex],
  ['appThemePickerIdx', keys.appThemePickerIdx, state.appThemePickerIndex],
  ['navIdx', keys.navIdx, state.navIndex],
  ['queueIdx', keys.queueIdx, state.queueIndex],
  ['taskPickerIdx', keys.taskPickerIdx, state.taskPickerIndex],
  ['profilePickerIdx', keys.profilePickerIdx, state.profilePickerIndex],
  ['profiles', keys.profiles, state.visibleProfiles],
];

const CARRIED: ReadonlyArray<[string, unknown, unknown]> = [
  ['recent', keys.recent, state.recent],
  ['navQuery', keys.navQuery, state.navQuery],
  ['navTabs', keys.navTabs, state.navTabs],
  ['queueItems', keys.queueItems, state.queueItems],
  ['visibleTasks', keys.visibleTasks, state.visibleTasks],
];

const CALLBACKS: ReadonlyArray<[string, unknown, unknown]> = [
  ['setRouteIndex', keys.setRouteIndex, state.setRouteIndex],
  ['chooseRoute', keys.chooseRoute, state.chooseRoute],
  ['runCommand', keys.runCommand, state.runCommand],
  ['setPickerIndex', keys.setPickerIndex, state.setPickerIndex],
  ['setPickerOpen', keys.setPickerOpen, state.setPickerOpen],
  ['openPicker', keys.openPicker, state.openPicker],
  ['setThemePickerIndex', keys.setThemePickerIndex, state.setThemePickerIndex],
  ['setThemePickerOpen', keys.setThemePickerOpen, state.setThemePickerOpen],
  ['pickTheme', keys.pickTheme, state.pickTheme],
  ['setAppThemePickerIndex', keys.setAppThemePickerIndex, state.setAppThemePickerIndex],
  ['setAppThemePickerOpen', keys.setAppThemePickerOpen, state.setAppThemePickerOpen],
  ['pickAppTheme', keys.pickAppTheme, state.pickAppTheme],
  ['setNavIndex', keys.setNavIndex, state.setNavIndex],
  ['setNavQuery', keys.setNavQuery, state.setNavQuery],
  ['selectNavTab', keys.selectNavTab, state.selectNavTab],
  ['setNavOpen', keys.setNavOpen, state.setNavOpen],
  ['openTabNav', keys.openTabNav, state.openTabNav],
  ['setQueueIndex', keys.setQueueIndex, state.setQueueIndex],
  ['setQueueOpen', keys.setQueueOpen, state.setQueueOpen],
  ['openQueue', keys.openQueue, state.openQueue],
  ['setTaskPickerIndex', keys.setTaskPickerIndex, state.setTaskPickerIndex],
  ['setTaskPickerOpen', keys.setTaskPickerOpen, state.setTaskPickerOpen],
  ['openTaskPicker', keys.openTaskPicker, state.openTaskPicker],
  ['pickTask', keys.pickTask, state.pickTask],
  ['toggleTaskDir', keys.toggleTaskDir, state.toggleTaskDir],
  ['setProfilePickerIndex', keys.setProfilePickerIndex, state.setProfilePickerIndex],
  ['setProfilePickerOpen', keys.setProfilePickerOpen, state.setProfilePickerOpen],
  ['openProfilePicker', keys.openProfilePicker, state.openProfilePicker],
  ['pickProfile', keys.pickProfile, state.pickProfile],
  ['openQuickOpen', keys.openQuickOpen, state.openQuickOpen],
];

describe('buildPickerKeyBindings', () => {
  it.each(OPEN_STATE)('carries %s through unrenamed', (_name, built, source) => {
    expect(built).toBe(source);
  });

  it.each(RENAMED)('fills %s from the state field it renames', (_name, built, source) => {
    expect(built).toBe(source);
  });

  it.each(CARRIED)('carries the %s list through by reference', (_name, built, source) => {
    expect(built).toBe(source);
  });

  it.each(CALLBACKS)('forwards %s by identity', (_name, built, source) => {
    expect(built).toBe(source);
  });

  it('covers every field the snapshot and callbacks declare', () => {
    const covered = [...OPEN_STATE, ...RENAMED, ...CARRIED, ...CALLBACKS].map(([name]) => name);
    expect(Object.keys(keys).toSorted(byName)).toEqual(covered.toSorted(byName));
  });

  // The snapshot's whole purpose is to answer `firstOpenOverlay`; a dropped open flag would make the
  // key handler disagree with the render tree about which overlay is up.
  it('rebuilds the same registry state the projection was made from', () => {
    const rebuilt = buildOverlayOpenState(keys);
    expect(rebuilt).toEqual(state.overlays);
    expect(OVERLAYS.map((overlay) => overlay.name).toSorted(byName)).toEqual(Object.keys(rebuilt).toSorted(byName));
  });
});
