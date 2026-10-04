import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountedPickerOverlayProps } from './overlay-props';
import { buildPickerOverlayView } from './overlay-view';
import { pickerStateFixture } from './state-test-fixture';

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

  // The mounted layers render the task picker, the tab navigator, and whatever a plugin has
  // contributed — not the whole `PickerOverlays` stack, which would be a second overlay stack
  // competing with it.
  it('projects exactly the fields a mounted tab body takes', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(mountedPickerOverlayProps(view)).toSorted(byName)).toEqual([
      'appThemePickerOverlay',
      'contributedOverlay',
      'navIndex', 'navOpen', 'navQuery', 'onPickTab', 'onPickTask', 'onToggleTaskDir',
      'taskPickerIndex', 'taskPickerOpen', 'taskRows',
    ]);
  });

  it('carries no contributed overlay when no plugin has one open', () => {
    expect(mountedPickerOverlayProps(view).contributedOverlay).toBeUndefined();
  });

  it('projects the existing app theme picker only when its registered overlay is open', () => {
    const closed = mountedPickerOverlayProps({ ...view, overlays: { ...view.overlays, appTheme: false } });
    expect(closed.appThemePickerOverlay).toBeUndefined();

    const open = mountedPickerOverlayProps({ ...view, theme: 'dark', appThemePickerIndex: 0 });
    render(React.createElement(React.Fragment, null, open.appThemePickerOverlay));
    expect(screen.getByText('theme')).toBeInTheDocument();
    expect(screen.getByText('dark').closest('.picker-row')).toHaveClass('selected');
  });
});
