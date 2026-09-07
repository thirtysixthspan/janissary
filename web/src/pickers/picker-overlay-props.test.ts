import { describe, expect, it } from 'vitest';
import { mountedPickerOverlayProps } from './picker-overlay-props';
import { buildPickerOverlayView } from './picker-overlay-view';
import { pickerStateFixture } from './picker-state-test-fixture';

const state = pickerStateFixture();
const view = buildPickerOverlayView(state);

// A view whose two open flags disagree with everything else, so an implementation reading any other
// field for "is it open" fails here.
const onlyTaskOpen = {
  ...view,
  overlays: { ...view.overlays, task: true, tabNav: false },
};

describe('mountedPickerOverlayProps', () => {
  it('reads the two open flags from the overlay registry state', () => {
    const props = mountedPickerOverlayProps(onlyTaskOpen);
    expect(props.taskPickerOpen).toBe(true);
    expect(props.navOpen).toBe(false);
  });

  it('forwards the rows, indices, and callbacks the two overlays render from', () => {
    const props = mountedPickerOverlayProps(view);
    expect(props.taskRows).toBe(state.visibleTasks);
    expect(props.taskPickerIndex).toBe(state.taskPickerIndex);
    expect(props.onPickTask).toBe(state.pickTask);
    expect(props.onToggleTaskDir).toBe(state.toggleTaskDir);
    expect(props.navQuery).toBe(state.navQuery);
    expect(props.navIndex).toBe(state.navIndex);
    expect(props.onPickTab).toBe(state.selectNavTab);
  });

  // The mounted layers render only the task picker and the tab navigator; anything more would be a
  // second overlay stack competing with `PickerOverlays`.
  it('projects exactly the nine fields a mounted tab body takes', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(mountedPickerOverlayProps(view)).toSorted(byName)).toEqual([
      'navIndex', 'navOpen', 'navQuery', 'onPickTab', 'onPickTask', 'onToggleTaskDir',
      'taskPickerIndex', 'taskPickerOpen', 'taskRows',
    ]);
  });
});
