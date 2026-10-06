import type { Managers } from '../managers.js';
import type { Tab } from './types.js';
import type { ConnectionView, ScheduleView, TabView } from '../protocol.js';
import { buildTabViews } from './view.js';

type Viewport = {
  tabs: Tab[];
  managers: Managers;
  shorten(path: string): string;
};

// The manager-facing piece of the view lifecycle: the broadcast view built from the port.
export function managerView(
  port: Viewport,
  connectionsFor: (label: string) => ConnectionView[],
  acpLabel: (label: string) => string | undefined,
  scheduleView: (label: string) => ScheduleView[],
): TabView[] {
  return buildTabViews(
    port.tabs, port.managers,
    connectionsFor, acpLabel, scheduleView,
    (p: string) => port.shorten(p),
  );
}
