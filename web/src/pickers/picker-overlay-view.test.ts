import { describe, expect, it } from 'vitest';
import { buildPickerOverlayView } from './picker-overlay-view';
import { pickerStateFixture } from './picker-state-test-fixture';

const state = pickerStateFixture();
const view = buildPickerOverlayView(state);
const byName = (a: string, b: string) => a.localeCompare(b);

// Every field of the render bag, paired with the state field it must come from. These pairs are the
// renames the app shell used to spell out prop by prop; getting one wrong here is the drift this
// projection exists to make impossible.
const MAPPING: ReadonlyArray<[string, unknown, unknown]> = [
  ['overlays', view.overlays, state.overlays],
  ['route', view.route, state.route],
  ['routeIndex', view.routeIndex, state.routeIndex],
  ['onPickRoute', view.onPickRoute, state.chooseRoute],
  ['syntaxTheme', view.syntaxTheme, state.syntaxTheme],
  ['themePickerIndex', view.themePickerIndex, state.themePickerIndex],
  ['onPickTheme', view.onPickTheme, state.pickTheme],
  ['theme', view.theme, state.theme],
  ['appThemePickerIndex', view.appThemePickerIndex, state.appThemePickerIndex],
  ['onPickAppTheme', view.onPickAppTheme, state.pickAppTheme],
  ['recent', view.recent, state.recent],
  ['pickerIndex', view.pickerIndex, state.pickerIndex],
  ['onPickHistory', view.onPickHistory, state.pick],
  ['navQuery', view.navQuery, state.navQuery],
  ['navIndex', view.navIndex, state.navIndex],
  ['tabs', view.tabs, state.tabs],
  ['onPickTab', view.onPickTab, state.selectNavTab],
  ['queueItems', view.queueItems, state.queueItems],
  ['queueIndex', view.queueIndex, state.queueIndex],
  ['onSelectQueue', view.onSelectQueue, state.selectQueueIndex],
  ['taskRows', view.taskRows, state.visibleTasks],
  ['taskPickerIndex', view.taskPickerIndex, state.taskPickerIndex],
  ['onPickTask', view.onPickTask, state.pickTask],
  ['onToggleTaskDir', view.onToggleTaskDir, state.toggleTaskDir],
  ['profiles', view.profiles, state.visibleProfiles],
  ['profilePickerIndex', view.profilePickerIndex, state.profilePickerIndex],
  ['onPickProfile', view.onPickProfile, state.pickProfile],
  ['quickOpenQuery', view.quickOpenQuery, state.quickOpenQuery],
  ['onChangeQuickOpenQuery', view.onChangeQuickOpenQuery, state.setQuickOpenQuery],
  ['quickOpenResults', view.quickOpenResults, state.quickOpenResults],
  ['quickOpenIndex', view.quickOpenIndex, state.quickOpenIndex],
  ['onChangeQuickOpenIndex', view.onChangeQuickOpenIndex, state.setQuickOpenIndex],
  ['quickOpenLoading', view.quickOpenLoading, state.quickOpenLoading],
  ['onPickQuickOpen', view.onPickQuickOpen, state.pickQuickOpenFile],
  ['onCloseQuickOpen', view.onCloseQuickOpen, state.closeQuickOpen],
  ['commandInputRef', view.commandInputRef, state.commandInputRef],
];

describe('buildPickerOverlayView', () => {
  it.each(MAPPING)('takes %s from the state field it renames', (_name, built, source) => {
    expect(built).toBe(source);
  });

  // A field added to the view type without a line above would otherwise be tested by nothing.
  it('covers every field the render bag declares', () => {
    expect(Object.keys(view).toSorted(byName)).toEqual(MAPPING.map(([name]) => name).toSorted(byName));
  });

  it('leaves nothing undefined for the render tree to fall back on', () => {
    expect(Object.values(view).filter((value) => value === undefined)).toEqual([]);
  });
});
