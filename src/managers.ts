import type { TabManager } from './tab/manager.js';
import type { ShellManager } from './shell-manager.js';
import type { AcpManager } from './acp/manager.js';
import type { DatabaseManager } from './database/manager.js';
import type { AgentCommunicationManager } from './agent/communication-manager.js';
import type { HarnessManager } from './harness/manager.js';
import type { SshManager } from './ssh-manager.js';
import type { RemoteManager } from './remote/manager.js';
import type { ScheduleManager } from './schedule/manager.js';
import type { PseudoterminalManager } from './pseudoterminal-manager.js';
import type { BrowserManager } from './browser/tab.js';
import type { ProfileManager } from './profile/manager.js';
import type { ConnectionManager } from './connection/manager.js';
import type { OpenFileManager } from './open-file-manager.js';
import type { CaptureManager } from './capture/manager.js';
import type { CommandManager } from './command/manager.js';
import type { WorkspaceManager } from './workspace/manager.js';
import type { GitSync } from './git-sync.js';
import type { MonitorManager } from './monitor/manager.js';
import type { FileNavigatorManager } from './file-navigator/manager.js';
import type { EditorWatchManager } from './editor/watch-manager.js';
import type { EditorAcpManager } from './editor/acp-manager.js';
import type { Questions } from './questions.js';
import type { TabPluginHost } from './plugins/host.js';
import type { ConversationsManager } from './conversations/manager.js';

export type ManagerLifecycle = {
  dispose?(): void;
};

// The per-tab release method the tab-close walk reads (`src/tab/cleanup.ts`). It sits on its own
// type rather than on `ManagerLifecycle`: `TabManager` already owns `closeTab(index)` as the
// orchestrating entry point, and a `label`-keyed method on the manager intersection would not type.
export type TabReleasingManager = {
  closeTab?(label: string): void;
};

type ManagerRegistry = {
  tab: TabManager;
  shell: ShellManager;
  acp: AcpManager;
  database: DatabaseManager;
  communication: AgentCommunicationManager;
  harness: HarnessManager;
  ssh: SshManager;
  remote: RemoteManager;
  schedule: ScheduleManager;
  pty: PseudoterminalManager;
  browser: BrowserManager;
  profile: ProfileManager;
  connection: ConnectionManager;
  openFile: OpenFileManager;
  capture: CaptureManager;
  command: CommandManager;
  workspace: WorkspaceManager;
  gitSync: GitSync;
  monitor: MonitorManager;
  fileNavigator: FileNavigatorManager;
  editorWatch: EditorWatchManager;
  editorAcp: EditorAcpManager;
  questions: Questions;
  plugins: TabPluginHost;
  conversations: ConversationsManager;
};

export type Managers = {
  [Name in keyof ManagerRegistry]: ManagerRegistry[Name] & ManagerLifecycle;
};

// The order `Controller.shutdown` disposes managers in. Stated here rather than derived from the
// assignment order in `controller/create-managers.ts`, which used to decide it by being reversed —
// making JavaScript's property-insertion order the dependency graph, in a file whose own comment
// invites reordering.
//
// Three groups, and the reason each sits where it does:
//
// 1. Session and process owners, first: they kill what they started while everything they need to
//    do so is still up.
// 2. `remote`, after every one of them. A remote PTY's `kill`, a remote ACP session's `acp-close`,
//    and a remote navigator port's session close are all `channel.send(...)`, and `RemoteChannel.send`
//    drops a frame silently once the channel is no longer attached — so closing the channels first
//    means the processes on the far host are never told to stop. The transport outlives everything
//    that speaks over it.
// 3. `questions`, `tab`, and `database` last: they hold the state the managers above read while
//    tearing down.
export const MANAGER_DISPOSE_ORDER = [
  'monitor',
  'capture',
  'command',
  'communication',
  'connection',
  'profile',
  'ssh',
  'harness',
  'shell',
  'schedule',
  'pty',
  'editorAcp',
  'editorWatch',
  'fileNavigator',
  'openFile',
  'acp',
  'browser',
  'gitSync',
  'workspace',
  'plugins',
  'conversations',
  'remote',
  'questions',
  'tab',
  'database',
] as const satisfies readonly (keyof Managers)[];

// A manager added to the registry without a position above fails this assignment, and the compiler
// names the missing key in the error. `satisfies` above covers the other direction — a name that is
// not a manager. A duplicate entry is the one thing types cannot see, so `managers.test.ts` pins it.
type UnorderedManager = Exclude<keyof Managers, (typeof MANAGER_DISPOSE_ORDER)[number]>;
export const MANAGER_DISPOSE_ORDER_IS_COMPLETE: [UnorderedManager] extends [never]
  ? true
  : UnorderedManager = true;
