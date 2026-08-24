// Server -> client events, composed into the shared contract by ../protocol.ts.
import type { TaskRow } from '../tab/types.js';
import type { ProfileRow } from '../profile/types.js';
import type { TabView, RouteChooserView, HarnessLaunchView } from './tab.js';
import type { ScheduleLaunchView } from './schedule.js';

export type StateEvent = {
  t: 'state'; tabs: TabView[]; activeTab: number; secondaryTab?: number; route: RouteChooserView | null;
  // The open "New harness" launch dialog, or null when it is closed.
  harnessLaunch: HarnessLaunchView | null;
  // The open "New schedule" dialog, or null when it is closed.
  scheduleLaunch: ScheduleLaunchView | null;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  globalHistory: string[];
  syntaxTheme: string;
  theme: string;
  tasks: TaskRow[];
  // Absolute path of the Janissary install's `ai/tasks` directory, used to build the `execute`
  // command for a built-in (Janissary-source) task row.
  janissaryTasksDir: string;
  profiles: ProfileRow[];
  // Absolute path of the project directory the server was started against. Drives the titlebar.
  projectDir: string;
  // App version (semver only, e.g. "0.5.4"). Drives the titlebar.
  version: string;
};
export type PtyDataEvent = { t: 'pty'; id: string; data: string };
export type PtyExitEvent = { t: 'pty-exit'; id: string; exitCode: number };
export type RpcReply = { t: 'rpc-reply'; id: number; result?: unknown; error?: string };
// Tells the client to close its window; the server then stops (the `quit`/`exit` command).
export type ByeEvent = { t: 'bye' };
// A profile's `layout` sidebar/tab-area sizes, applied on `profile launch`. Window sizing is
// applied directly over CDP and never reaches the client — see product/specs/profiles.md.
export type LayoutEvent = {
  t: 'layout';
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  focusLeft?: 'files' | 'notifications';
  focusRight?: 'files' | 'notifications';
};
// Asks every connected client to report its file navigators' cursor/anchor/selection, which live
// only in client state. Issued by `profile save`, which waits briefly for the matching
// `reportFileNavigatorSelection` reply before writing the file — see src/file-navigator/selection-request.ts.
export type CollectTreeStateEvent = { t: 'collect-tree-state'; id: number };
export type ServerEvent =
  StateEvent | PtyDataEvent | PtyExitEvent | RpcReply | ByeEvent | LayoutEvent | CollectTreeStateEvent;
