import type { CompletionResult, FileNavigatorDetail, Sinks } from './types.js';
import { TranscriptStore } from './transcript/store.js';
import * as fileNavigatorRpc from './controller/file-navigator.js';
import { complete as completeCommand } from './controller/completion.js';
import { wireControllerEvents } from './controller/events.js';
import { createManagers } from './controller/create-managers.js';
import { saveFile } from './editor/save.js';
import { syncEditorBuffer } from './editor/sync.js';
import { resyncEditorTab } from './editor/resync.js';
import { syncPageSnapshot } from './page/sync.js';
import { messageBus } from './bus.js';
import { runSuggestion } from './monitor/window.js';
import { listPersonas } from './personas.js';
import type { TabView } from './protocol.js';
import type { Managers } from './managers.js';
import type { AcpRef, BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerChoice, FileNavigatorSelectionRecord } from './protocol.js';
import type { EditorSuggestParams, EditorSuggestResult } from './editor-suggest/handler.js';
import { buildStateEvent } from './state-event.js';
import { openTranscriptFor, openHarnessTranscriptFor, openAcpTranscript } from './controller/transcript.js';
import { projectFilesFor } from './project-files.js';
import { setClientLayout } from './client-layout.js';
import { editorSuggest, ownerLabel } from './editor-suggest/handler.js';
import { closeConnection } from './connection/close.js';
import { resolveTreeSelections } from './file-navigator/selection-request.js';

export class Controller {
  managers: Managers = {} as Managers;

  get rootDir(): string { return this.projectDir ?? process.cwd(); }

  constructor(private sinks: Sinks, private projectDir?: string) {
    createManagers(this.managers, projectDir);
    wireControllerEvents(this.managers, this.sinks);
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

  // Write an editor tab's buffer back to disk (the `saveFile` RPC). Throws on error; the RPC
  // layer relays the message to the client.
  saveFile(url: string, content: string): void {
    saveFile(this.managers, url, content);
  }

  // Cache an editor tab's in-progress buffer as transient draft state (the `editorSync` RPC).
  // In-memory only; never written to disk.
  syncEditorBuffer(url: string, content: string): void {
    syncEditorBuffer(this.managers, url, content);
  }

  // Manually re-pull a synced editor tab's shared workspace (the `resyncEditorTab` RPC,
  // fire-and-forget — see editor/resync.js for the sync-status/reload handling).
  resyncEditorTab(url: string): void {
    void resyncEditorTab(this.managers, url);
  }

  // Cache a page tab's currently visible text as transient snapshot state (the `pageSync` RPC).
  // In-memory only; never written to disk or sent to any client.
  syncPageSnapshot(url: string, text: string): void {
    syncPageSnapshot(this.managers, url, text);
  }

  // --- monitor reporting tabs ------------------------------------------------

  runSuggestion(id: string): void {
    runSuggestion(this.managers, id);
  }

  rateSuggestion(id: string, up: boolean): void {
    this.managers.monitor.rate(id, up);
  }

  resetMonitorContext(name: string): void {
    this.managers.monitor.resetContext(name);
  }

  monitorContextSnapshot(name: string): void {
    this.managers.monitor.snapshotContext(name);
  }

  // --- inline terminal cards (PTY) -----------------------------------------

  ptyInput(id: string, data: string): void { this.managers.pty.input(id, data); }
  ptyResize(id: string, cols: number, rows: number): void { this.managers.pty.resizeOne(id, cols, rows); }
  ptyKill(id: string): void { this.managers.pty.kill(id); }
  resize(cols: number, rows: number): void { this.managers.pty.resize(cols, rows); }

  // --- tab management ------------------------------------------------------

  setActiveTab(index: number): void {
    this.managers.tab.setActiveTab(index);
  }

  focusTab(label: string): void { this.managers.tab.setActiveTab(this.managers.tab.findIndex(label)); }
  moveTabToOtherPane(index: number): void { this.managers.tab.moveTabToOtherPane(index); }

  moveTab(dir: -1 | 1): void {
    this.managers.tab.moveTab(dir);
  }

  reorderTab(dir: -1 | 1): void {
    this.managers.tab.reorderTab(dir);
  }

  reorderTabTo(from: number, to: number): void {
    this.managers.tab.reorderTabTo(from, to);
  }

  closeTab(index: number): void {
    this.managers.tab.closeTab(index);
  }

  renameTab(index: number, title: string): void {
    this.managers.tab.renameTab(index, title);
  }

  navigatePage(index: number, url: string): void {
    this.managers.tab.navigatePage(index, url);
  }

  editQueuedCommand(index: number, text: string): void {
    this.managers.tab.editQueued(this.managers.tab.cur().label, index, text);
  }

  deleteQueuedCommand(index: number): void {
    this.managers.tab.deleteQueued(this.managers.tab.cur().label, index);
  }

  toggleCollapse(): void {
    this.managers.tab.toggleCollapse();
  }

  // --- file navigator tabs (see controller/file-navigator.ts) ------------------------

  fileNavigatorToggle(index: number, path: string): void {
    fileNavigatorRpc.fileNavigatorToggle(this.managers, index, path);
  }

  fileNavigatorCollapseAll(index: number): void {
    fileNavigatorRpc.fileNavigatorCollapseAll(this.managers, index);
  }

  fileNavigatorSetDetail(index: number, details: FileNavigatorDetail): void {
    fileNavigatorRpc.fileNavigatorSetDetail(this.managers, index, details);
  }

  fileNavigatorReroot(index: number, relPath?: string): void {
    fileNavigatorRpc.fileNavigatorReroot(this.managers, index, relPath);
  }

  moveFileNavigatorItem(index: number, fromRelPath: string, toRelPath: string): void {
    fileNavigatorRpc.moveFileNavigatorItem(this.managers, index, fromRelPath, toRelPath);
  }

  moveFileNavigatorItems(index: number, sourcePaths: string[], destinationPath: string, policy?: BulkConflictPolicy): BulkMoveResult {
    return fileNavigatorRpc.moveFileNavigatorItems(this.managers, index, sourcePaths, destinationPath, policy);
  }

  pasteFileNavigatorItems(index: number, sources: string[], destinationPath: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy): BulkMoveResult {
    return fileNavigatorRpc.pasteFileNavigatorItems(this.managers, index, sources, destinationPath, mode, policy);
  }

  deleteFileNavigatorItem(index: number, relPath: string): void {
    fileNavigatorRpc.deleteFileNavigatorItem(this.managers, index, relPath);
  }

  deleteFileNavigatorItems(index: number, paths: string[]): BatchResult {
    return fileNavigatorRpc.deleteFileNavigatorItems(this.managers, index, paths);
  }

  renameFileNavigatorItem(index: number, relPath: string, newName: string): void {
    fileNavigatorRpc.renameFileNavigatorItem(this.managers, index, relPath, newName);
  }

  fileNavigatorSearch(index: number): Promise<string[]> { return fileNavigatorRpc.fileNavigatorSearch(this.managers, index); }
  revealFileNavigatorItem(index: number, relPath: string): void { fileNavigatorRpc.revealFileNavigatorItem(this.managers, index, relPath); }
  fileNavigatorOpeners(index: number, relPath: string, edit: boolean): { command?: 'open' | 'edit'; choices: FileOpenerChoice[] } {
    return fileNavigatorRpc.fileNavigatorOpeners(this.managers, index, relPath, edit);
  }
  reportFileNavigatorSelection(id: number, navigators: FileNavigatorSelectionRecord[]): void { resolveTreeSelections(id, navigators); }

  undoFileNavigatorItem(index: number, overwrite?: boolean, skipConflicts?: boolean) {
    return fileNavigatorRpc.undoFileNavigatorItem(this.managers, index, overwrite, skipConflicts);
  }

  redoFileNavigatorItem(index: number, overwrite?: boolean, skipConflicts?: boolean) {
    return fileNavigatorRpc.redoFileNavigatorItem(this.managers, index, overwrite, skipConflicts);
  }

  // Dock/undock any dockable tab (file navigator or notifications). The mechanism is view-agnostic —
  // `TabManager.setDock` operates on any tab index — so both kinds share this one handler.
  setDock(index: number, dock: 'left' | 'right' | null): void {
    this.managers.tab.setDock(index, dock);
  }

  // Open (or retarget an existing) file navigator at the named tab's cwd — the 📁 metadata-row
  // button (see controller/file-navigator.ts).
  openFileNavigatorFor(label: string): void {
    fileNavigatorRpc.openFileNavigatorFor(this.managers, label);
  }

  // Launch a new agent tab rooted at the named tab's cwd — the ➕ metadata-row button.
  launchAgentFor(label: string): void {
    this.managers.profile.newAgentAt(label);
  }

  openTranscriptFor(label: string): void { openTranscriptFor(this.managers, label); }
  openHarnessTranscriptFor(label: string): void { openHarnessTranscriptFor(this.managers, label); }
  openAcpTranscript(acpRef: AcpRef): void { openAcpTranscript(this.managers, acpRef); }
  reportLayout(layout: { sidebarLeft: number; sidebarRight: number; tabAreaPct: number }): void { setClientLayout(layout); }

  projectFiles(): Promise<{ root: string; paths: string[] }> { return projectFilesFor(this.managers); }
  projectFilesFallback(): { root: string; paths: string[] } { return { root: this.managers.tab.launchDir, paths: [] }; }
  editorPersonas(): string[] { return listPersonas('editor'); }

  editorSuggest(params: EditorSuggestParams, callback: (result: EditorSuggestResult) => void): void {
    editorSuggest(this.managers, params, callback);
  }

  closeEditorConnection(url: string, persona: string): void { closeConnection('acp', persona, this.managers, ownerLabel(this.managers, url), () => { /* no-op */ }); }

  // Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
  // paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
  // and `browser` subcommands / window ids.
  complete(text: string, cursor: number): CompletionResult {
    return completeCommand(this.managers, text, cursor);
  }

  shutdown(): void {
    const names = Object.keys(this.managers) as Array<keyof Managers>;
    for (const name of names.toReversed()) this.managers[name].dispose?.();
    messageBus.clear();
  }
}
