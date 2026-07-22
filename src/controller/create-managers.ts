import { HarnessManager } from '../harness/manager.js';
import { SshManager } from '../ssh-manager.js';
import { DatabaseManager } from '../database/manager.js';
import { AcpManager } from '../acp/manager.js';
import { ShellManager } from '../shell-manager.js';
import { WorkspaceManager } from '../workspace-manager.js';
import { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { ScheduleManager } from '../schedule/manager.js';
import { ProfileManager } from '../profile/manager.js';
import { ConnectionManager } from '../connection/manager.js';
import { OpenFileManager } from '../open-file-manager.js';
import { FileTreeManager } from '../file-tree/manager.js';
import { EditorWatchManager } from '../editor/watch-manager.js';
import { EditorAcpManager } from '../editor/acp-manager.js';
import { CaptureManager } from '../capture/manager.js';
import { AgentCommunicationManager } from '../agent/communication-manager.js';
import { BrowserManager } from '../browser/tab.js';
import { CommandManager } from '../command/manager.js';
import { MonitorManager } from '../monitor/manager.js';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';

// Populates every manager onto an already-allocated (empty) `Managers` object, in construction
// order (later managers may reference earlier ones via `this.managers` at call time, not
// construction time, so the object need not be fully populated yet). Split out of the Controller
// constructor purely to keep controller.ts under the file-size guideline; this has no state of its
// own, mirroring `controller/events.ts`.
export function createManagers(managers: Managers, projectDir?: string): void {
  managers.database = new DatabaseManager();
  managers.tab = new TabManager(managers, projectDir);
  managers.workspace = new WorkspaceManager(projectDir);
  managers.browser = new BrowserManager(managers);
  managers.acp = new AcpManager(managers);
  managers.openFile = new OpenFileManager(managers);
  managers.fileTree = new FileTreeManager(managers);
  managers.editorWatch = new EditorWatchManager(managers);
  managers.editorAcp = new EditorAcpManager(managers);
  managers.pty = new PseudoterminalManager(managers);
  managers.schedule = new ScheduleManager(managers);
  managers.shell = new ShellManager(managers);
  managers.harness = new HarnessManager(managers);
  managers.ssh = new SshManager(managers);
  managers.profile = new ProfileManager(managers);
  managers.connection = new ConnectionManager(managers);
  managers.communication = new AgentCommunicationManager(managers);
  managers.command = new CommandManager(managers);
  managers.capture = new CaptureManager(managers);
  managers.monitor = new MonitorManager(managers);
}
