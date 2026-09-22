import { HARNESS_COMMANDS } from './index.js';
import { HarnessScreenReader } from './screen.js';
import { HarnessRecorder } from './recorder.js';
import { captureWiring } from './capture-wire.js';
import { HarnessRuntime } from './runtime.js';
import { HarnessTranscriptTailer } from './transcript/tailer.js';
import { createTranscriptSource } from './transcript/sources.js';
import { notify } from '../notifications/index.js';
import type { RemoteChannel } from '../remote/channel.js';
import type { E2EBrowserHandle } from '../browser/e2e-server.js';
import type { Managers } from '../managers.js';

// Which observers hang off one PTY, and how they are wired together. Split out of `HarnessManager`
// for the same reason `capture-wire.ts` was: the manager decides *that* a PTY gets observers, not
// what they are. The two factories are the two spawn paths — a named harness, and an ssh session
// whose PTY `SshManager` spawns itself.

export type HarnessObserverOptions = {
  managers: Managers;
  name: string;
  label: string;
  id: string;
  cwd: string;
  autoApprove: boolean;
  channel: RemoteChannel | undefined;
  // The tab's e2e browser, for a `-b` launch. Not an observer, but a per-PTY resource the runtime
  // owns and disposes on the same path — see the comment on `HarnessRuntime`.
  browser?: E2EBrowserHandle;
};

// The full observer set for a named harness tab: capture wiring (auto-approve plus busy status), a
// screen reader feeding it, an asciicast recorder, and — when the harness has a session record to
// tail — a transcript tailer. A remote tab reads its transcript from the other host's channel
// instead of a local dot directory; everything else is identical, EXCEPT the screen reader and its
// capture wiring, which a remote tab does not get at all: gate-detection, auto-approve, and busy
// status all run server-side for a remote harness now (decision 14 of the auto-accept-while-detached
// plan), fed by the far side's own relayed bytes rather than this tab's — see
// `src/remote/pty-session.ts`'s `onGateEvent`/`onBusyTransition` handlers for where the far side's
// reports land locally instead. A recording failure is reported once in the notifications feed, for
// the same reason an ssh tab's is: a silent gap would defeat the point of an audit recording.
export function harnessRuntime(options: HarnessObserverOptions): HarnessRuntime {
  const { managers, name, label, id, cwd, autoApprove, channel } = options;
  const dims = managers.pty.spawnDimensions();
  const capture = channel ? undefined : captureWiring(managers, name, label, id, autoApprove);
  const reader = channel ? undefined : new HarnessScreenReader(id, dims.cols, dims.rows, capture?.handler);
  const recorder = new HarnessRecorder(id, label, HARNESS_COMMANDS[name], dims.cols, dims.rows, () => {
    notify(managers, 'harness-recording-failed', label);
  });
  const source = channel ? managers.remote.transcriptSource(label) : createTranscriptSource(name, cwd, Date.now());
  const tailer = source
    ? new HarnessTranscriptTailer(label, source, () => { notify(managers, 'transcript-unavailable', label); })
    : undefined;
  return new HarnessRuntime(reader, recorder, tailer, capture?.autoApprover, options.browser);
}

// The observer pair for an ssh tab: a screen reader (no capture handler — auto-approve and busy
// detection are harness-specific) and a recorder whose asciicast header carries the verbatim
// `ssh …` invocation, so a stray `.cast` names the host it came from. No transcript source and no
// tailer: an ssh tab runs no harness binary and has no session record to tail, which is what keeps
// `transcriptTailer(label)` undefined for it. A recording failure is reported once in the
// notifications feed — a silent gap would defeat the point of an audit recording.
export function sshRuntime(managers: Managers, id: string, label: string, command: string): HarnessRuntime {
  const dims = managers.pty.spawnDimensions();
  const reader = new HarnessScreenReader(id, dims.cols, dims.rows);
  const recorder = new HarnessRecorder(id, label, command, dims.cols, dims.rows, () => {
    notify(managers, 'ssh-recording-failed', label);
  });
  return new HarnessRuntime(reader, recorder);
}
