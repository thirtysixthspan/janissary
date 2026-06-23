import type { ChildProcess } from 'node:child_process';
import type { Tab, LogEntry } from '../tab.js';
import type { AgentState } from '../agent-state.js';
import type { AcpInfo, AcpSession } from '../acp.js';
import type { TabBrowser } from '../browser.js';
import type { MessageKind } from '../messaging.js';

export type CommandHandlerContext = {
  tabs: Tab[];
  activeTab: number;
  updateCurrentTab: (updater: (tab: Tab) => Tab) => void;
  setTabs: (updater: (prev: Tab[]) => Tab[]) => void;
  setActiveTab: (fn: ((prev: number) => number) | number) => void;
  setInteractive: (v: { cmd: string; cwd?: string } | null) => void;
  setHistoryPickerOpen: (open: boolean) => void;
  setHistoryPickerIdx: (fn: ((prev: number) => number) | number) => void;
  setAgentStates: (updater: (prev: Record<string, AgentState>) => Record<string, AgentState>) => void;
  setAcpInfo: (updater: (prev: Record<number, AcpInfo>) => Record<number, AcpInfo>) => void;
  setShellActive: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  setTabDbConns: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  exit: () => void;
  shellsRef: { current: Map<number, ChildProcess> };
  acpRef: { current: Map<number, AcpSession> };
  browserRef: { current: Map<number, { browser: TabBrowser; current?: string; counter: number }> };
  cwdRef: { current: Record<string, string> };
  workspaceRef: { current: Set<string> };
  runShellInTab: (tabIndex: number, tabLabel: string, shellCmd: string, onComplete?: (output: string) => void, display?: boolean) => void;
  runBrowserInTab: (tabIndex: number, cmd: string) => Promise<string>;
  runDbInTab: (label: string, cmd: string) => string;
  finishRunning: (label: string, output: string) => void;
  closeBrowserWindow: (tabIndex: number, id: string) => Promise<string>;
  closeTabBrowser: (tabIndex: number) => void;
  forgetDbConn: (name: string) => void;
  appendLog: (label: string, entry: LogEntry) => void;
  initAgentState: (
    name: string, dotColor: string,
  ) => { cmdHistory?: string[]; log?: LogEntry[]; cwd?: string; workspaceDir?: string };
  sendMessage: (msg: { from: string; to: string; kind: MessageKind; text: string }) => boolean;
  saveTabLog: (label: string, log: LogEntry[]) => void;
  setAgentActive: (name: string, active: boolean) => void;
  shellName: string;
  columns: number;
  frequentHistory: string[];
};

export interface Command {
  name: string;
  match: (cmd: string) => boolean;
  handler: (cmd: string, ctx: CommandHandlerContext) => void;
}
