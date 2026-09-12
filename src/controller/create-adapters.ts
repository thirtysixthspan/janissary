import type { Managers } from '../managers.js';
import { createTabControllerAdapter, type TabControllerAdapter } from './tab-adapter.js';
import { createMonitorControllerAdapter, type MonitorControllerAdapter } from './monitor-adapter.js';
import { createEditorControllerAdapter, type EditorControllerAdapter } from './editor-adapter.js';
import { createFileNavigatorControllerAdapter, type FileNavigatorControllerAdapter } from './file-navigator-adapter.js';
import { createPluginControllerAdapter, type PluginControllerAdapter } from './plugin-adapter.js';

// Every member the five adapter surfaces contribute to the controller.
export type ControllerMembers =
  TabControllerAdapter
  & MonitorControllerAdapter
  & EditorControllerAdapter
  & FileNavigatorControllerAdapter
  & PluginControllerAdapter;

// The composition is the check: a factory dropped from the spread leaves the object type short of
// its adapter's members, and the declared return type rejects it at compile time.
export function createControllerAdapters(managers: Managers): ControllerMembers {
  return {
    ...createTabControllerAdapter(managers),
    ...createMonitorControllerAdapter(managers),
    ...createEditorControllerAdapter(managers),
    ...createFileNavigatorControllerAdapter(managers),
    ...createPluginControllerAdapter(managers),
  };
}
