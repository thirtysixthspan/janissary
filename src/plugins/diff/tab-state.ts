import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import type { ChangeSetResult } from './change-set.js';
import { displayRoot } from './display.js';
import type { DiffFile, DiffPayload } from './shared.js';
import { preserveContextErrors } from './context-results.js';

// One diff tab: which directory it shows, which machine that directory is on, and what it currently
// shows there. Split out of the session, which now holds one of these per open tab rather than a
// single root and a single payload — the project-root diff and one diff per workspace each being
// their own tab, each with its own recompute, expansions, and keyboard walk.

// Where the route that opened the tab was standing: the launch directory every display abbreviates
// against, and the workspace clone when the opening tab has one.
export type DiffOrigin = { root: string; workspace?: { dir: string } };

// How a tab's change set is read: locally, with git on this machine, or over the channel to the host
// the workspace lives on. The directory is handed over on every read rather than bound once, because
// a tab is re-scoped from one directory to another and the read has to follow it. The capabilities are
// the ones the triggering call arrived with, because a remote read is answered through the tab that
// rides the channel — which is this tab, not the tab the command was typed in.
export type ChangeSetReader = (
  root: string, capabilities: TabPluginServerCapabilities, fullFiles: ReadonlySet<string>,
) => Promise<ChangeSetResult>;

function emptyPayload(instanceKey: string, split = false): DiffPayload {
  return { instanceKey, root: '', state: 'done', message: '', split, files: [] };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n').find((line) => line.trim().length > 0) ?? 'git diff failed';
}

function resultChanges(result: ChangeSetResult, previous: DiffFile[]): Partial<DiffPayload> {
  switch (result.kind) {
    case 'not-repository': {
      return { state: 'not-repository', message: '', files: [] };
    }
    case 'error': {
      return { state: 'error', message: result.reason, files: [] };
    }
    default: {
      return { state: 'done', message: '', files: preserveContextErrors(result.files, previous) };
    }
  }
}

export class DiffTab {
  private root: string;
  private payload: DiffPayload;
  private inFlight = false;
  private fullFiles = new Set<string>();
  private revision = 0;
  private disposed = false;

  constructor(
    readonly instanceKey: string,
    readonly title: string,
    root: string,
    origin: DiffOrigin,
    private read: ChangeSetReader,
    private capabilities: TabPluginServerCapabilities,
    start: { split: boolean; host?: string; workspace?: boolean },
  ) {
    this.root = root;
    // Nothing is known about this directory yet, so the tab starts loading rather than reading as an
    // empty change set for the moment the first recompute takes.
    this.payload = {
      ...emptyPayload(instanceKey, start.split),
      root: displayRoot(root, origin.root, origin.workspace?.dir),
      state: 'loading',
      ...(start.host !== undefined && { host: start.host }),
      ...(start.workspace === true && { workspace: true }),
    };
  }

  // The payload this tab publishes, so an intent can answer with the tab it was about.
  get shown(): DiffPayload { return this.payload; }

  // What a freshly opened tab shows: nothing known yet about this root, so it shows nothing rather
  // than another root's change set.
  opening(): DiffPayload {
    return { ...this.payload, state: 'loading', message: '', files: [] };
  }
  // Open or focus this tab, scoped to `root`. A tab already open on another directory is focused and
  // then re-scoped here; the cleared payload is published through `updateTab` because the focus path
  // runs no factory, and the recompute that follows paints only when its result lands.
  open(root: string, origin: DiffOrigin): void {
    const rescope = root !== this.root;
    if (rescope) { this.fullFiles.clear(); this.revision++; }
    this.root = root;
    this.payload = {
      ...this.payload,
      root: displayRoot(root, origin.root, origin.workspace?.dir),
      ...(rescope && { state: 'loading', message: '', files: [] }),
    };
    this.capabilities.openOrFocusTab(this.instanceKey, () => {
      // The host runs this factory only when the tab has to be built, so it is exactly the "this tab
      // is new" case: a reopened tab starts over rather than inheriting the expansions of the one that
      // was closed.
      this.fullFiles.clear();
      this.revision++;
      this.payload = { ...this.payload, state: 'loading', message: '', files: [] };
      return { title: this.title, payload: this.opening() };
    });
    this.publish({});
    this.recompute(this.capabilities);
  }

  async refresh(capabilities: TabPluginServerCapabilities): Promise<void> {
    await this.recompute(capabilities);
  }

  layout(split: boolean): void {
    this.payload = { ...this.payload, split };
    this.publish({});
  }

  setFullFile(relPath: string, fullFile: boolean): void {
    const file = this.payload.files.find((candidate) => candidate.path === relPath);
    if (!file || file.binary || file.added || file.deleted || file.hunks.length === 0) {
      this.capabilities.rejectRequest('Cannot expand context for a file outside the current text diff.');
      return;
    }
    if (file.expandingContext) return;
    if (fullFile) this.fullFiles.add(relPath);
    else this.fullFiles.delete(relPath);
    this.revision++;
    this.publish({ files: this.payload.files.map((candidate) => candidate.path === relPath
      ? { ...candidate, expandingContext: true, contextError: '' } : candidate) });
    this.recompute(this.capabilities);
  }

  // Open a file at a line in an editor tab, through the same containment check the search tab's
  // `openMatch` makes: a path the diff never produced gets nothing. A remote workspace's files are
  // materialized to a local cache first, and that path is what opens, so a remote row's click is the
  // same open a local row's is.
  openFile(relPath: string, line: number): void {
    if (!isInsideRoot(this.root, path.join(this.root, relPath))) return;
    if (this.payload.host === undefined) {
      this.capabilities.openInEditor(path.join(this.root, relPath), line);
      return;
    }
    const local = this.capabilities.materializeRemoteFile(relPath);
    if (local === null) return;
    void Promise.resolve(local).then((materialized) => {
      if (materialized === null) return;
      this.capabilities.openInEditor(materialized, line);
    });
  }

  // Open a binary file in the media tab its extension already opens, by offering the application's
  // own `open` line for the path it opens to the ordinary dispatcher.
  openMedia(relPath: string): void {
    if (!isInsideRoot(this.root, path.join(this.root, relPath))) return;
    if (this.payload.host === undefined) {
      void this.capabilities.dispatchLineWithOutput(`open ${path.join(this.root, relPath)}`);
      return;
    }
    const local = this.capabilities.materializeRemoteFile(relPath);
    if (local === null) return;
    void Promise.resolve(local).then((materialized) => {
      if (materialized === null) return;
      void this.capabilities.dispatchLineWithOutput(`open ${materialized}`);
    });
  }

  dispose(): void {
    this.disposed = true;
  }

  // Nothing this method does may escape. The recompute runs outside the intent that asked for it, so
  // a throw here would be an unhandled rejection — and an unhandled rejection takes the process down,
  // which would close every tab in the application rather than this one.
  //
  // A recompute paints the tab when its result lands, never when it starts: the payload already
  // published stands until the answer replaces it, so the once-a-second poll never blanks the body.
  private recompute(capabilities: TabPluginServerCapabilities): void {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    const fullFiles = new Set(this.fullFiles);
    const revisionAtStart = this.revision;
    void Promise.resolve(this.read(this.root, capabilities, fullFiles)).then(
      (result) => {
        this.inFlight = false;
        if (this.disposed) return;
        if (this.revision === revisionAtStart) this.publish(resultChanges(result, this.payload.files));
        if (this.revision !== revisionAtStart) this.recompute(capabilities);
      },
      (error: unknown) => {
        this.inFlight = false;
        if (this.disposed) return;
        if (this.revision === revisionAtStart) {
          this.publish({ state: 'error', message: reasonOf(error), files: [] });
        }
      },
    );
  }

  // A publish the host refuses — a payload it will not accept — leaves nothing to answer with: the
  // tab is already gone as far as the application is concerned. Nothing else here may escape either:
  // a recompute runs outside the intent that asked for it, so a throw would be an unhandled
  // rejection, and an unhandled rejection takes the process down — closing every tab in the
  // application rather than this one.
  private publish(changes: Partial<DiffPayload>): void {
    this.payload = { ...this.payload, ...changes };
    try {
      this.capabilities.updateTab(this.instanceKey, () => ({ payload: this.payload }));
    } catch {
      // Deliberately empty.
    }
  }
}
