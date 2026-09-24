import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { workspacePath } from '../workspace/index.js';
import { workspaceLabelError } from '../workspace/label.js';
import { checkLaunchName, sameLaunchName } from './check.js';
import { hasLeftoverWorkspace, isWorkspaceRunning, removeLeftoverWorkspace } from './leftover.js';
import { cleanedNotice, invalidNameRefusal, localRunningRefusal, removalFailedRefusal } from './messages.js';

// The local half of the launch-name check: read the open tabs and the sessions rows, run the pure
// check, and — for a `-w` launch — clear a leftover workspace folder before the clone would land on
// it. Every refusal and cleanup goes to the notifications feed, attributed to `creator`, the tab the
// command was typed in (or the issuing tab of a profile launch). Nothing reaches a transcript.

// What a profile entry refused here is listed under in the launch summary's `Skipped:` part. The
// refusal itself has already been posted with its full reason.
export const LAUNCH_REFUSED = 'launch refused — see notifications';

export type LocalLaunchName = {
  creator: string;
  name: string;
  explicit: boolean;
  // A local `-w` launch: the name also has to be free of a live workspace owner, and a leftover
  // folder under it is removed. A launch without `-w` creates no workspace and skips both.
  workspace: boolean;
  candidates?: Iterable<string>;
  skip?: readonly string[];
};

// The refusal for an explicit `-w` name that cannot become one workspace folder, checked before
// anything reads or removes a path built from it. A default name is drawn from a fixed set of safe
// names, and a launch without `-w` builds no path, so either keeps any label it likes.
function invalidWorkspaceName(request: LocalLaunchName): string | undefined {
  if (!request.workspace || !request.explicit) return undefined;
  const reason = workspaceLabelError(request.name);
  return reason === undefined ? undefined : invalidNameRefusal(request.name, reason);
}

function runningCheck(managers: Managers, workspace: boolean): ((name: string) => string | undefined) | undefined {
  if (!workspace) return undefined;
  const tabUses = (dir: string) => managers.tab.tabs.some((tab) => tab.workspaceDir !== undefined
    && sameLaunchName(tab.workspaceDir, dir));
  return (name) => (isWorkspaceRunning(name, tabUses) ? localRunningRefusal(name, workspacePath(name)) : undefined);
}

/**
 * The name a local launch goes ahead under, or undefined once it has been refused (and the refusal
 * posted). A `-w` launch's leftover folder is removed and announced here, before the caller clones.
 */
export function resolveLocalLaunchName(managers: Managers, request: LocalLaunchName): string | undefined {
  const invalid = invalidWorkspaceName(request);
  if (invalid !== undefined) {
    notify(managers, 'launch-refused', request.creator, invalid);
    return undefined;
  }
  const result = checkLaunchName({
    name: request.name,
    explicit: request.explicit,
    tabs: managers.tab.allLabels(),
    rows: managers.sessions.view(),
    candidates: request.candidates,
    skip: request.skip,
    running: runningCheck(managers, request.workspace),
  });
  if (!result.accepted) {
    notify(managers, 'launch-refused', request.creator, result.message);
    return undefined;
  }
  if (request.workspace && !clearLeftover(managers, request.creator, result.name)) return undefined;
  return result.name;
}

// Remove a leftover folder under `name`, if there is one. False once a failed removal has been
// posted as the launch's refusal. A launch that cannot clone keeps the leftover and goes on, so the
// caller's `create` fails with the same error it always has and nothing was lost for it.
function clearLeftover(managers: Managers, creator: string, name: string): boolean {
  if (!hasLeftoverWorkspace(name)) return true;
  if (managers.workspace.preflight() !== undefined) return true;
  const dir = workspacePath(name);
  const failure = removeLeftoverWorkspace(name);
  if (failure !== undefined) {
    notify(managers, 'launch-refused', creator, removalFailedRefusal(name, dir, failure));
    return false;
  }
  notify(managers, 'launch-workspace-cleaned', creator, cleanedNotice(name, dir));
  return true;
}
