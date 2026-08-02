import type { CompletionResult } from './completion/types.js';
import type { Sinks } from './controller/types.js';
import { TranscriptStore } from './transcript/store.js';
import { complete as completeCommand } from './controller/completion.js';
import { wireControllerEvents } from './controller/events.js';
import { createManagers } from './controller/create-managers.js';
import { messageBus } from './bus.js';
import type { TabView } from './protocol.js';
import type { Managers } from './managers.js';
import type { AcpRef } from './protocol.js';
import { buildStateEvent } from './state-event.js';
import { openTranscriptFor, openHarnessTranscriptFor, openAcpTranscript } from './controller/transcript.js';
import { setClientLayout } from './client-layout.js';
import { createTabControllerAdapter, type TabControllerAdapter } from './controller/tab-adapter.js';
import { createMonitorControllerAdapter, type MonitorControllerAdapter } from './controller/monitor-adapter.js';
import { createEditorControllerAdapter, type EditorControllerAdapter } from './controller/editor-adapter.js';
import { createFileNavigatorControllerAdapter, type FileNavigatorControllerAdapter } from './controller/file-navigator-adapter.js';
import { createPluginControllerAdapter, type PluginControllerAdapter } from './controller/plugin-adapter.js';

export class Controller implements TabControllerAdapter, MonitorControllerAdapter, EditorControllerAdapter, FileNavigatorControllerAdapter, PluginControllerAdapter {
  managers: Managers = {} as Managers;

  declare setActiveTab: TabControllerAdapter['setActiveTab'];
  declare focusTab: TabControllerAdapter['focusTab'];
  declare moveTabToOtherPane: TabControllerAdapter['moveTabToOtherPane'];
  declare moveTab: TabControllerAdapter['moveTab'];
  declare reorderTab: TabControllerAdapter['reorderTab'];
  declare reorderTabTo: TabControllerAdapter['reorderTabTo'];
  declare closeTab: TabControllerAdapter['closeTab'];
  declare renameTab: TabControllerAdapter['renameTab'];
  declare navigatePage: TabControllerAdapter['navigatePage'];
  declare editQueuedCommand: TabControllerAdapter['editQueuedCommand'];
  declare deleteQueuedCommand: TabControllerAdapter['deleteQueuedCommand'];
  declare toggleCollapse: TabControllerAdapter['toggleCollapse'];
  declare ptyInput: TabControllerAdapter['ptyInput'];
  declare ptyResize: TabControllerAdapter['ptyResize'];
  declare ptyKill: TabControllerAdapter['ptyKill'];
  declare resize: TabControllerAdapter['resize'];
  declare runSuggestion: MonitorControllerAdapter['runSuggestion'];
  declare rateSuggestion: MonitorControllerAdapter['rateSuggestion'];
  declare resetMonitorContext: MonitorControllerAdapter['resetMonitorContext'];
  declare monitorContextSnapshot: MonitorControllerAdapter['monitorContextSnapshot'];
  declare saveFile: EditorControllerAdapter['saveFile'];
  declare pluginIntent: PluginControllerAdapter['pluginIntent'];
  declare syncEditorBuffer: EditorControllerAdapter['syncEditorBuffer'];
  declare resyncEditorTab: EditorControllerAdapter['resyncEditorTab'];
  declare syncPageSnapshot: EditorControllerAdapter['syncPageSnapshot'];
  declare projectFiles: EditorControllerAdapter['projectFiles'];
  declare projectFilesFallback: EditorControllerAdapter['projectFilesFallback'];
  declare editorPersonas: EditorControllerAdapter['editorPersonas'];
  declare editorSuggest: EditorControllerAdapter['editorSuggest'];
  declare closeEditorConnection: EditorControllerAdapter['closeEditorConnection'];
  declare fileNavigatorToggle: FileNavigatorControllerAdapter['fileNavigatorToggle'];
  declare fileNavigatorCollapseAll: FileNavigatorControllerAdapter['fileNavigatorCollapseAll'];
  declare fileNavigatorSetDetail: FileNavigatorControllerAdapter['fileNavigatorSetDetail'];
  declare fileNavigatorReroot: FileNavigatorControllerAdapter['fileNavigatorReroot'];
  declare moveFileNavigatorItem: FileNavigatorControllerAdapter['moveFileNavigatorItem'];
  declare moveFileNavigatorItems: FileNavigatorControllerAdapter['moveFileNavigatorItems'];
  declare pasteFileNavigatorItems: FileNavigatorControllerAdapter['pasteFileNavigatorItems'];
  declare deleteFileNavigatorItem: FileNavigatorControllerAdapter['deleteFileNavigatorItem'];
  declare deleteFileNavigatorItems: FileNavigatorControllerAdapter['deleteFileNavigatorItems'];
  declare renameFileNavigatorItem: FileNavigatorControllerAdapter['renameFileNavigatorItem'];
  declare fileNavigatorSearch: FileNavigatorControllerAdapter['fileNavigatorSearch'];
  declare revealFileNavigatorItem: FileNavigatorControllerAdapter['revealFileNavigatorItem'];
  declare fileNavigatorOpeners: FileNavigatorControllerAdapter['fileNavigatorOpeners'];
  declare reportFileNavigatorSelection: FileNavigatorControllerAdapter['reportFileNavigatorSelection'];
  declare undoFileNavigatorItem: FileNavigatorControllerAdapter['undoFileNavigatorItem'];
  declare redoFileNavigatorItem: FileNavigatorControllerAdapter['redoFileNavigatorItem'];
  declare setDock: FileNavigatorControllerAdapter['setDock'];
  declare openFileNavigatorFor: FileNavigatorControllerAdapter['openFileNavigatorFor'];
  declare launchAgentFor: FileNavigatorControllerAdapter['launchAgentFor'];

  get rootDir(): string { return this.projectDir ?? process.cwd(); }

  constructor(private sinks: Sinks, private projectDir?: string) {
    createManagers(this.managers, projectDir);
    wireControllerEvents(this.managers, this.sinks);
    Object.assign(
      this,
      createTabControllerAdapter(this.managers),
      createMonitorControllerAdapter(this.managers),
      createEditorControllerAdapter(this.managers),
      createFileNavigatorControllerAdapter(this.managers),
      createPluginControllerAdapter(this.managers),
    );
    this.managers.schedule.start();
  }

  // Restore tabs from persisted agent state (for `--relaunch`). Called before any client connects.
  rehydrate(): void {
    this.managers.tab.rehydrate(
      (name) => TranscriptStore.load(name),
      (s) => { if (s.schedule) this.managers.schedule.set(s.name, s.schedule); },
    );
  }

  view(): TabView[] {
    return this.managers.tab.view(
      (l) => this.managers.connection.connectionsFor(l),
      (l) => this.managers.acp.label(l),
      (l) => this.managers.schedule.view(l),
      this.managers.schedule.aggregatedView(),
    );
  }

  routeView(): { cmd: string; choices: string[] } | null {
    return this.managers.command.routeView();
  }

  stateEvent() { return buildStateEvent(this); }

  chooseRoute(index: number): void {
    this.managers.command.chooseRoute(index);
  }

  harnessLaunchView() { return this.managers.harness.harnessLaunchView(); }
  closeHarnessLaunch(): void { this.managers.harness.closeLaunchDialog(); }
  scheduleLaunchView() { return this.managers.schedule.scheduleLaunchView(); }
  closeScheduleLaunch(): void { this.managers.schedule.closeScheduleLaunch(); }
  cancelSchedule(tab: string, id: string): void { this.managers.schedule.cancel(tab, id); }
  clearSchedules(): void { this.managers.schedule.clearAll(); }

  answerQuestion(tab: string, id: string, answer: string | null): void {
    if (!this.managers.questions.answer(tab, id, answer)) throw new Error('question not found');
  }

  dispatch(text: string): void {
    this.managers.command.dispatch(text);
  }

  // The absolute path behind an `/open/<id>` ref, or undefined when not registered (drives the route).
  openFilePath(id: string): string | undefined {
    return this.managers.tab.openFilePath(id);
  }

  openTranscriptFor(label: string): void { openTranscriptFor(this.managers, label); }
  openHarnessTranscriptFor(label: string): void { openHarnessTranscriptFor(this.managers, label); }
  openAcpTranscript(acpRef: AcpRef): void { openAcpTranscript(this.managers, acpRef); }
  reportLayout(layout: { sidebarLeft: number; sidebarRight: number; tabAreaPct: number }): void { setClientLayout(layout); }

  // Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
  // paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
  // and `browser` subcommands / window ids.
  complete(text: string, cursor: number): CompletionResult {
    return completeCommand(this.managers, text, cursor);
  }

  // Managers are disposed in reverse construction order, each awaited before the next starts, so a
  // consumer has fully released its references by the time the manager it depends on tears down.
  // A manager whose disposal is asynchronous — the plugin host, which hands each activated plugin a
  // bounded disposal window — would otherwise be cut short by process exit.
  async shutdown(): Promise<void> {
    const names = Object.keys(this.managers) as Array<keyof Managers>;
    for (const name of names.toReversed()) await this.managers[name].dispose?.();
    messageBus.clear();
  }
}
