import type { VisibleTaskRow } from '../task-picker-keys';
import type { PickerOverlayView } from './overlay-view';
import { contributedOverlayOnScreen } from '../../shared/contributed-overlays';

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
  // A contributed overlay is not one of the two above but reaches a harness tab the same way: its
  // chord passes out of the terminal, so the popup it opens has to render over it.
  contributedOverlay?: React.ReactNode;
};

// The subset of the overlay view a mounted tab body renders. Only these two overlays, plus whatever
// a plugin has contributed, reach a harness tab (see `MountedViewLayers`), and their open flags come
// from the registry's state rather than from a separate pair of booleans — which is what the app shell
// used to spell out by hand.
export function mountedPickerOverlayProps(view: PickerOverlayView): PickerOverlayProps {
  const contributed = contributedOverlayOnScreen();
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
    contributedOverlay: contributed ? contributed.render(null) : undefined,
  };
}
