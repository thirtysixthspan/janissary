import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { LaunchCheckUnanswered, LaunchNameRefusal } from './refusal.js';
import {
  checkUnansweredRefusal, cleanedNotice, harnessRetriesRefusal, poolRetriesRefusal, remoteRunningRefusal,
  removalFailedRefusal,
} from './messages.js';

// The one failure funnel a provisioning placeholder closes through, for harness and agent tabs
// alike. A remote host's label refusal closes the placeholder at once — posting the refusal, or,
// for a default name, silently relaunching under the next free one. Every other failure keeps
// today's behavior: the error is shown on the tab, which closes after a short delay.

// Attempts in total, the first included, before a default name's remote launch gives up.
export const MAX_REMOTE_NAME_ATTEMPTS = 5;

// What a fresh launch carries down so its failure can be reported and, for a default name,
// retried. Absent for an attach, which brings back an existing session rather than naming one.
export type RemoteNameRetry = {
  // The tab the command was typed in, or a profile launch's issuing tab: every notification this
  // launch posts is attributed to it.
  creator: string;
  explicit: boolean;
  // Every label this launch has tried, oldest first, ending with this attempt's.
  tried: readonly string[];
  // Reopen the launch under the next free name, passing over every label in `tried`.
  relaunch: (tried: readonly string[]) => void;
};

export type RemoteLaunchFailure = {
  label: string;
  kind: 'harness' | 'agent';
  error: unknown;
  message: string;
  retry?: RemoteNameRetry;
  // Today's display of an ordinary failure: the harness tab's `provisionError`, or the agent
  // launch's `out` line.
  show: (message: string) => void;
};

function closeTab(managers: Managers, label: string): void {
  const index = managers.tab.findIndex(label);
  if (index !== -1) managers.tab.closeTab(index);
}

function retriesExhausted(kind: RemoteLaunchFailure['kind'], tried: readonly string[], host: string): string {
  return kind === 'harness'
    ? harnessRetriesRefusal(tried[0], tried.at(-1) ?? tried[0], host)
    : poolRetriesRefusal(tried, host);
}

function refuse(managers: Managers, failure: RemoteLaunchFailure, refusal: LaunchNameRefusal, retry: RemoteNameRetry): void {
  closeTab(managers, failure.label);
  const { label, host, path, reason } = refusal;
  if (path !== undefined && reason !== undefined) {
    notify(managers, 'launch-refused', retry.creator, removalFailedRefusal(label, path, reason, host));
    return;
  }
  if (retry.explicit) {
    notify(managers, 'launch-refused', retry.creator, remoteRunningRefusal(label, host));
    return;
  }
  if (retry.tried.length < MAX_REMOTE_NAME_ATTEMPTS) {
    retry.relaunch(retry.tried);
    return;
  }
  notify(managers, 'launch-refused', retry.creator, retriesExhausted(failure.kind, retry.tried, host));
}

// A remote launch landed on a host that first removed a leftover workspace under its label: say so,
// once, attributed to the launch's creator. An attach carries no `retry` and never cleans.
export function reportRemoteCleanup(
  managers: Managers, retry: RemoteNameRetry | undefined, label: string, host: string, cleaned: string | undefined,
): void {
  if (retry === undefined || cleaned === undefined) return;
  notify(managers, 'launch-workspace-cleaned', retry.creator, cleanedNotice(label, cleaned, host));
}

export function failRemoteLaunch(managers: Managers, failure: RemoteLaunchFailure): void {
  const { error, retry } = failure;
  if (error instanceof LaunchNameRefusal && retry) {
    refuse(managers, failure, error, retry);
    return;
  }
  failure.show(failure.message);
  if (error instanceof LaunchCheckUnanswered && retry) {
    notify(managers, 'launch-refused', retry.creator, checkUnansweredRefusal(failure.label, error.host, error.message));
  }
  setTimeout(() => closeTab(managers, failure.label), PROVISION_FAILURE_CLOSE_DELAY_MS);
}
