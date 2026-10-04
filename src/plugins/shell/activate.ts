import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginHostState,
  type TabPluginIntentEntry,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isEmptyShellIntent, isShellCommandState, isShellCompleteRequest, isShellCwd, isShellDispatch, isShellPayload,
  type ShellCommandState, type ShellCompleteRequest, type ShellPayload, type ShellQueuedLine,
} from './shared.js';
import { openShellTab } from './open-tab.js';

let invocationCounter = 0;

// One tab per `zsh`, always. The instance key is minted per invocation rather than derived from the
// directory, so two `zsh` in the same place are two tabs — a shell is stateful, and refocusing the
// first would take the foreground program and the cwd away from the second.
function nextInstanceKey(): string {
  invocationCounter += 1;
  return `shell-${invocationCounter}`;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isShellPayload,
    opener: noFileOpener('shell'),
    command: (_argument, capabilities) => {
      openShellTab(capabilities, nextInstanceKey());
    },
    // The rows the metadata row's status windows render, merged into the payload with `updateTab` —
    // which leaves the tab's label, position, group and instance key alone, so a push never disturbs
    // the tab it is describing. Slices the declaration did not name arrive empty and are written back
    // empty, so a declaration that narrows its claim is not quietly fed the slice it declined.
    hostState: (state: TabPluginHostState, capabilities: TabPluginServerCapabilities) => {
      const current = state.tabPayload;
      // A payload this plugin cannot read is a payload it did not produce, so there is nothing to
      // merge into and nothing to say. The tab reports its own broken payload the moment its intent is
      // answered, which is the same split `rejectRequest` and `reportFailure` already draw.
      if (!isShellPayload(current)) return;
      capabilities.updateTab(state.instanceKey, () => ({
        payload: {
          ...current,
          connections: state.connections as ShellPayload['connections'],
          schedule: state.schedule as ShellPayload['schedule'],
        },
      }));
    },
    // The three routes the client sends. `dispatch` and `complete` exist because the primitives behind
    // them are server capabilities — `dispatchLine` and `completeLine` — and a plugin's only channel
    // to the server is an intent, so each capability needs exactly one wire route of its own. One
    // route rather than a resolve-then-decide pair for `dispatch`, so the application's command table
    // is consulted once, in the one place that owns it.
    intent: defineIntents<
      ShellPayload,
      {
        'terminal-status': TabPluginIntentEntry<ShellPayload, undefined>;
        'command-state': TabPluginIntentEntry<ShellPayload, ShellCommandState>;
        cwd: TabPluginIntentEntry<ShellPayload, string>;
        dispatch: TabPluginIntentEntry<ShellPayload, string>;
        complete: TabPluginIntentEntry<ShellPayload, ShellCompleteRequest>;
        queue: TabPluginIntentEntry<ShellPayload, string>;
        dequeue: TabPluginIntentEntry<ShellPayload, undefined>;
      }
    >('shell', isShellPayload, {
      // Asked once on mount. A tab whose shell exited while no browser was attached holds the payload
      // of a process that finished minutes ago and has no way to hear about it: the exit event went to
      // nobody, and a plugin tab is in-memory only. This is how it finds out and closes.
      'terminal-status': {
        payload: isEmptyShellIntent,
        run: (tabPayload, _payload, capabilities) => ({
          running: capabilities.terminalRunning(tabPayload.ptyId),
        }),
      },
      'command-state': {
        payload: isShellCommandState,
        run: (tabPayload, state, capabilities) => {
          if (state.running) capabilities.setUnread(tabPayload.instanceKey, false);
          else if (tabPayload.commandRunning) capabilities.setUnread(tabPayload.instanceKey, true);
          capabilities.updateTab(tabPayload.instanceKey, () => ({
            payload: { ...tabPayload, commandRunning: state.running },
          }));
          return { updated: true };
        },
      },
      cwd: {
        payload: isShellCwd,
        run: (tabPayload, cwd, capabilities) => {
          capabilities.recordCwd(cwd);
          capabilities.updateTab(tabPayload.instanceKey, () => ({
            payload: { ...tabPayload, cwd },
          }));
          return { updated: true };
        },
      },
      dispatch: {
        payload: isShellDispatch,
        run: (_tabPayload, line, capabilities) => capabilities.dispatchLineWithOutput(line),
      },
      complete: {
        payload: isShellCompleteRequest,
        run: (_tabPayload, request, capabilities) =>
          capabilities.completeLine(request.line, request.cursor),
      },
      // A line the bar submitted while zsh was busy, and the next one to run once it is not. The
      // client decides when to drain, because only it hears zsh return to its prompt.
      queue: {
        payload: isShellDispatch,
        run: (_tabPayload, line, capabilities) => {
          capabilities.queueLine(line);
          return { queued: true };
        },
      },
      dequeue: {
        payload: isEmptyShellIntent,
        run: (_tabPayload, _payload, capabilities): ShellQueuedLine => ({ line: capabilities.nextQueuedLine() }),
      },
    }),
  };
}
