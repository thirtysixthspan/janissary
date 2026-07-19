import type { Managers } from './managers.js';

// CommandManager's FIFO command-queue gate, extracted whole: agent tabs queue while busy (or
// while idle with entries already waiting, to preserve FIFO) instead of running immediately.
// `run` stays a callback so this module never itself decides how a command executes (that stays
// CommandManager's — it's the one that touches shell/PTY dispatch).

export function dispatchOrRunOp(
  managers: Managers, trimmed: string, label: string, index: number,
  run: (input: string, label: string, index: number) => void,
  drainQueue: (label: string) => void,
): void {
  if (!trimmed) { run(trimmed, label, index); return; }
  const tab = managers.tab.tabs[index];
  const isAgentTab = tab !== undefined && (tab.view === undefined || tab.view === 'agent');
  const wasIdle = !managers.tab.isBusy(label);
  const alreadyQueued = managers.tab.queueFor(label).length > 0;
  if (isAgentTab && (!wasIdle || alreadyQueued)) {
    managers.tab.enqueue(label, trimmed);
    managers.tab.append(label, { input: '', output: `Queued: ${trimmed}` });
    if (wasIdle) drainQueue(label);
    return;
  }
  run(trimmed, label, index);
}

// Runs queued commands FIFO until the tab goes busy, its queue empties, or a route chooser
// becomes pending (resumed by `CommandManager.chooseRoute`).
export function drainQueueOp(
  managers: Managers, label: string,
  hasPendingRoute: () => boolean,
  run: (input: string, label: string, index: number) => void,
): void {
  for (;;) {
    const index = managers.tab.findIndex(label);
    if (index === -1 || managers.tab.isBusy(label) || hasPendingRoute()) return;
    const command = managers.tab.dequeue(label);
    if (command === undefined) return;
    run(command, label, index);
  }
}
