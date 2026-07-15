import { makeHarnessTab, distinctColor, uniqueLabel } from '../tab/index.js';
import { parseHarnessCommand, HARNESS_COMMANDS, buildHarnessCommand } from './index.js';
import { isKnownModel } from './models.js';
import { HarnessScreenReader, type ScreenCapture } from './screen.js';
import { HarnessRecorder } from './recorder.js';
import { HarnessAutoApprover } from './auto-approve.js';
import { busyStatusHandler } from './busy-status.js';
import { writeCaptureFile } from './capture-file.js';
import type { HarnessView, ProfileHarnessEntry } from '../types.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';
import { sandboxNotice } from '../sandbox/index.js';
import type { Managers } from '../managers.js';

// Owns harness command handling: launching a harness `<name>` as a PTY-backed tab (optionally in a
// fresh `--workspace` git clone, and optionally under a custom `as <label>`) and naming it uniquely.
// The controller owns the shared tab and PTY state; this module owns the harness-specific decisions
// and wiring.
export class HarnessManager {
  private screenReaders = new Map<string, HarnessScreenReader>();
  private recorders = new Map<string, HarnessRecorder>();
  private autoApprovers = new Map<string, HarnessAutoApprover>();

  constructor(private managers: Managers) {
    messageBus.on('pty', 'exit', (event) => {
      if (event.type !== 'exit') return;
      this.screenReaders.get(event.id)?.dispose();
      this.screenReaders.delete(event.id);
      this.recorders.get(event.id)?.dispose();
      this.recorders.delete(event.id);
      this.autoApprovers.delete(event.id);
    });
  }

  // The named harness tab's most recent rendered-screen capture, or undefined when the tab is
  // missing, is not a harness tab, or has no capture yet. Exposes the screen reader's rendered
  // text (the coherent, de-ANSI'd form) to monitors without exposing the reader map.
  latestScreenText(label: string): ScreenCapture | undefined {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.harness) return undefined;
    return this.screenReaders.get(tab.harness.ptyId)?.latestCapture();
  }

  // Handle a `harness <name> [as <label>] [-w] [--offline] [--model <name>] [--effort <level>]`
  // command. Returns an error message to surface in the creator's transcript, or undefined once
  // the harness tab has been opened.
  run(input: string): string | undefined {
    const parsed = parseHarnessCommand(input);
    if ('error' in parsed) return parsed.error;
    if ('capture' in parsed) return this.capture(input, parsed.label);
    if (parsed.model && !isKnownModel(parsed.name, parsed.model)) {
      return `Unknown model "${parsed.model}" for harness "${parsed.name}" — add it to harness-models.json.`;
    }
    return this.open(parsed.name, parsed.workspace, parsed.offline, parsed.autoApprove, parsed.label, parsed.model, parsed.effort);
  }

  // Handle `harness capture <name>`: write the target tab's latest in-memory screen capture to a
  // file under .janissary/captures/ and open it in a normal editor tab. Returns an error message
  // to surface in the invoking tab's transcript, or undefined on success.
  capture(input: string, label: string): string | undefined {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab) return `No tab labeled "${label}".`;
    if (!tab.harness) return `"${label}" is not a harness tab.`;
    const latest = this.screenReaders.get(tab.harness.ptyId)?.latestCapture();
    if (!latest) return `No capture available for "${label}" yet.`;
    const file = writeCaptureFile(label, latest.capturedAt, latest.text);
    this.managers.openFile.edit(input, file, this.managers.tab.cur().label);
    return undefined;
  }

  // Open (and focus) a harness tab running `name`, labeled `label` if given (otherwise `name`).
  // With `workspace`, the harness starts in a fresh clone of the `origin` remote of the repo
  // detected from cwd; otherwise it inherits the creator's cwd.
  private open(
    name: string, workspace: boolean, offline: boolean, autoApprove: boolean, label_?: string,
    model?: string, effort?: string,
  ): string | undefined {
    const creator = this.managers.tab.cur();
    const label = uniqueLabel(this.managers.tab.tabs, label_ ?? name);

    const dir = this.parseDir(this.resolveCwd(workspace, label, this.managers.tab.cwdOf(creator.label) ?? process.cwd()));
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    this.spawnTab(name, label, cwd, workspaceDir, offline, group, groupColor, dotColor, autoApprove, model, effort);
    return undefined;
  }

  // Open a harness tab for a profile entry: unlike `open()`, the group/color come from the
  // profile launch (not the creator tab) and the starting directory comes from the entry's own
  // `cwd`/`workspace` (falling back to the issuing tab's cwd when the entry has neither). Returns
  // an error to report and skip on, or undefined once the tab is open. Never persisted — harness
  // tabs have no agent state.
  openFromProfile(entry: ProfileHarnessEntry, label: string, group: number, groupColor: string): string | undefined {
    const unique = uniqueLabel(this.managers.tab.tabs, label);
    const dir = this.parseDir(this.resolveCwd(!!entry.workspace, unique, entry.cwd ?? process.cwd()));
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor), entry.dotColor);
    this.spawnTab(entry.harness, unique, cwd, workspaceDir, entry.offline ?? false, group, groupColor, dotColor, entry.autoApprove ?? false, entry.model, entry.effort);
    return undefined;
  }

  // Shared core: create the harness tab, focus it, and spawn its PTY. `model`/`effort`, when
  // given, are passed to the harness binary via `buildHarnessCommand`.
  private spawnTab(
    name: string, label: string, cwd: string, workspaceDir: string | undefined, offline: boolean,
    group: number, groupColor: string, dotColor: string, autoApprove: boolean, model?: string, effort?: string,
  ): void {
    const program = HARNESS_COMMANDS[name];
    const harness: HarnessView = { name, program, ptyId: '', status: 'running' };
    const tab = makeHarnessTab(label, dotColor, this.managers.tab.tabs.length + 1, group, groupColor, harness, workspaceDir);
    tab.offline = offline;
    tab.autoApprove = autoApprove;
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setCwd(label, cwd);
    this.managers.tab.addBusy(label);
    this.managers.tab.activeTab = this.managers.tab.findIndex(tab.label);
    const id = this.managers.pty.spawn(label, program, buildHarnessCommand(name, model, effort), cwd, workspaceDir, offline);
    const dims = this.managers.pty.spawnDimensions();
    this.screenReaders.set(id, new HarnessScreenReader(id, dims.cols, dims.rows, this.captureHandler(name, label, id, autoApprove)));
    this.recorders.set(id, new HarnessRecorder(id, label, program, dims.cols, dims.rows));
    const liveTab = this.managers.tab.tabs.find((t) => t.label === label);
    if (liveTab?.harness) liveTab.harness.ptyId = id;
    const notice = workspaceDir ? sandboxNotice() : undefined;
    if (notice) this.managers.tab.append(label, { input: '', output: notice });
    messageBus.emit('state', { type: 'dirty' });
  }

  // Build the screen-reader callback that feeds each fresh capture to whichever consumers apply:
  // the auto-approver (when `autoApprove` is on) and the busy/ready status handler (when the
  // harness has a detector). The approver runs first so the busy handler reads its stuck state as
  // of the same capture. Returns undefined when neither applies, so the reader runs exactly as it
  // would with no consumers.
  private captureHandler(name: string, label: string, id: string, autoApprove: boolean): ((capture: ScreenCapture) => void) | undefined {
    const approver = this.buildAutoApprover(name, label, id, autoApprove);
    const busyHandler = busyStatusHandler(name, label, this.managers, approver);
    if (!approver && !busyHandler) return undefined;
    return (capture) => {
      approver?.onCapture(capture);
      busyHandler?.(capture);
    };
  }

  // When `autoApprove` is on, build the tab's auto-approver and register it under the PTY id;
  // otherwise return undefined. The approver injects the approval keystroke back into this PTY
  // and reports each approval to the notifications feed (label-free — `notify` prefixes the tab
  // label).
  private buildAutoApprover(name: string, label: string, id: string, autoApprove: boolean): HarnessAutoApprover | undefined {
    if (!autoApprove) return undefined;
    const approver = new HarnessAutoApprover({
      harnessName: name,
      approve: (keystroke) => this.managers.pty.input(id, keystroke),
      notify: (message) => notify(this.managers, 'auto-approve', label, message),
    });
    this.autoApprovers.set(id, approver);
    return approver;
  }

  // Parse `resolveCwd`'s result into a clean `{ cwd, workspaceDir }` or return the error string.
  private parseDir(resolved: string | { dir: string } | { error: string }): string | { cwd: string; workspaceDir: string | undefined } {
    if (typeof resolved !== 'string' && 'error' in resolved) return resolved.error;
    return {
      cwd: typeof resolved === 'string' ? resolved : resolved.dir,
      workspaceDir: typeof resolved === 'string' ? undefined : resolved.dir,
    };
  }

  // The harness's starting directory: a new workspace clone (with `workspace`) or `fallbackCwd`.
  // Returns the directory, or an `{ error }` to surface when there's no repo or the clone fails.
  // A workspace clone is returned as `{ dir }` (not a bare string) so the caller can tell it apart
  // from the fallback cwd and record it on the tab for cleanup on close.
  private resolveCwd(workspace: boolean, label: string, fallbackCwd: string): string | { dir: string } | { error: string } {
    if (!workspace) return fallbackCwd;
    return this.managers.workspace.create(label);
  }
}
