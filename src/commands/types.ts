import type { ChildProcess } from 'node:child_process';
import type {
  Tab, LogEntry, AgentState, AcpInfo, AcpSession, TabBrowser, MessageKind,
} from '../types.js';
import type { RouteChoice } from '../recognizers/types.js';

export type CommandHandlerContext = {
  tabs: Tab[];
  activeTab: number;
  updateCurrentTab: (updater: (tab: Tab) => Tab) => void;
  updateTab: (index: number, updater: (tab: Tab) => Tab) => void;
  setTabs: (updater: (previous: Tab[]) => Tab[]) => void;
  setActiveTab: (function_: ((previous: number) => number) | number) => void;
  setInteractive: (v: { cmd: string; cwd?: string } | null) => void;
  setHistoryPickerOpen: (isOpen: boolean) => void;
  setHistoryPickerIdx: (function_: ((previous: number) => number) | number) => void;
  setAgentStates: (updater: (previous: Record<string, AgentState>) => Record<string, AgentState>) => void;
  setAcpInfo: (updater: (previous: Record<number, AcpInfo>) => Record<number, AcpInfo>) => void;
  setShellActive: (updater: (previous: Record<number, boolean>) => Record<number, boolean>) => void;
  setTabDbConns: (updater: (previous: Record<string, string[]>) => Record<string, string[]>) => void;
  exit: () => void;
  shellsRef: { current: Map<number, ChildProcess> };
  acpRef: { current: Map<number, AcpSession> };
  browserRef: { current: Map<number, { browser: TabBrowser; current?: string; counter: number }> };
  cwdRef: { current: Record<string, string> };
  workspaceRef: { current: Set<string> };
  runShellInTab: (tabIndex: number, tabLabel: string, shellCommand: string, onComplete?: (output: string) => void, shouldDisplay?: boolean) => void;
  runBrowserInTab: (tabIndex: number, command: string) => Promise<string>;
  runDbInTab: (label: string, command: string) => string;
  finishRunning: (label: string, output: string) => void;
  closeBrowserWindow: (tabIndex: number, id: string) => Promise<string>;
  closeTabBrowser: (tabIndex: number) => void;
  forgetDbConn: (name: string) => void;
  appendLog: (label: string, entry: LogEntry) => void;
  initAgentState: (
    name: string, dotColor: string, group?: number, groupColor?: string,
  ) => { cmdHistory?: string[]; log?: LogEntry[]; cwd?: string; workspaceDir?: string; group?: number; groupColor?: string };
  sendMessage: (message: { from: string; to: string; kind: MessageKind; text: string }) => boolean;
  saveTabLog: (label: string, log: LogEntry[]) => void;
  setAgentActive: (name: string, isActive: boolean) => void;
  shellName: string;
  columns: number;
  frequentHistory: string[];
  // Names of sqlite databases with an open connection in `label`'s tab (for db recognition).
  getOpenDbs: (label: string) => string[];
  // Open the route-chooser window for an unprefixed command whose route is ambiguous.
  openRouteChooser: (command: string, choices: RouteChoice[]) => void;
};

export interface Command {
  name: string;
  match: (command: string) => boolean;
  handler: (command: string, context: CommandHandlerContext) => void;
}
