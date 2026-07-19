import type { VisibleTaskRow } from './task-picker-keys';

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
