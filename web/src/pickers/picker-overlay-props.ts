import type { VisibleTaskRow } from './task-picker-keys';
import type { PickerOverlayView } from './picker-overlay-view';

// Ctrl+A/Ctrl+G task-picker and tab-navigator overlay props, shared by every component that
// renders those two overlays on top of a mounted tab body.
export type PickerOverlayProps = {
  taskPickerOpen?: boolean;
  taskRows?: VisibleTaskRow[];
  taskPickerIndex?: number;
  onPickTask?: (path: string) => void;
  onToggleTaskDir?: (path: string) => void;
  navOpen?: boolean;
  navQuery?: string;
  navIndex?: number;
  onPickTab?: (index: number) => void;
};

// The subset of the overlay view a mounted tab body renders. Only these two overlays reach a
// harness tab (see `MountedViewLayers`), and their open flags come from the registry's state rather
// than from a separate pair of booleans — which is what the app shell used to spell out by hand.
export function mountedPickerOverlayProps(view: PickerOverlayView): PickerOverlayProps {
  return {
    taskPickerOpen: view.overlays.task,
    taskRows: view.taskRows,
    taskPickerIndex: view.taskPickerIndex,
    onPickTask: view.onPickTask,
    onToggleTaskDir: view.onToggleTaskDir,
    navOpen: view.overlays.tabNav,
    navQuery: view.navQuery,
    navIndex: view.navIndex,
    onPickTab: view.onPickTab,
  };
}
