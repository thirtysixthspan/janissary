import type { CompletionResult } from './completion/types.js';
import type { Sinks } from './controller/types.js';
import { TranscriptStore } from './transcript/store.js';
import { complete as completeCommand } from './controller/completion.js';
import { wireControllerEvents } from './controller/events.js';
import { createManagers } from './controller/create-managers.js';
import { messageBus } from './bus.js';
import type { TabView } from './protocol.js';
import { MANAGER_DISPOSE_ORDER, type Managers } from './managers.js';
import type { AcpRef } from './protocol.js';
import { buildStateEvent } from './state-event.js';
import { openTranscriptFor, openHarnessTranscriptFor, openAcpTranscript } from './controller/transcript.js';
import { setClientLayout } from './client-layout.js';
import { createControllerAdapters, type ControllerMembers } from './controller/create-adapters.js';

// The controller's own surface. The five adapter surfaces are attached by `createController` below
// rather than declared here, and `Controller` is the composition of the two.
export class ControllerCore {
  managers: Managers = {} as Managers;

  get rootDir(): string { return this.projectDir ?? process.cwd(); }

  constructor(private sinks: Sinks, private projectDir?: string) {
    createManagers(this.managers, projectDir);
    wireControllerEvents(this.managers, this.sinks);
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

  shutdown(): void {
    for (const name of MANAGER_DISPOSE_ORDER) this.managers[name].dispose?.();
    messageBus.clear();
  }
}

export type Controller = ControllerCore & ControllerMembers;

// `Object.assign` types the result as the intersection, so the adapter record reaching the instance
// is checked rather than asserted. The scheduler starts last, once the surface is complete.
export function createController(sinks: Sinks, projectDir?: string): Controller {
  const core = new ControllerCore(sinks, projectDir);
  const controller = Object.assign(core, createControllerAdapters(core.managers));
  controller.managers.schedule.start();
  return controller;
}
