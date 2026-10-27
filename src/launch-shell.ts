import type { Managers } from './managers.js';
import { errorText } from './error-text.js';
import { SHELL_COMMAND, SHELL_PLUGIN_ID, shellTabPtyId } from './shell/shell-tab-terminal.js';

// The tab every launch opens: a zsh shell tab, labelled `janus`, opened before the server listens so
// no window ever sees an empty strip. It comes from the bundled shell plugin like any other shell,
// through a launch origin rather than a tab — there is no tab yet to open it from.
export const LAUNCH_LABEL = 'janus';

// Throws when no tab came of it — no zsh to run, or a shell plugin that failed or is disabled — so
// the launch stops with the reason instead of serving an application with no tab to type into.
export async function openLaunchShell(managers: Managers): Promise<void> {
  const outcome = await managers.plugins.runCommandResult(SHELL_PLUGIN_ID, SHELL_COMMAND, {
    label: LAUNCH_LABEL, command: SHELL_COMMAND, launch: true,
  });
  if (outcome.status !== 'ok') {
    const reason = outcome.status === 'rejected' ? outcome.reason : outcome.error;
    throw new Error(`could not open the launch shell: ${errorText(reason)}`, { cause: reason });
  }
  const tab = managers.tab.byLabel(LAUNCH_LABEL);
  const ptyId = shellTabPtyId(tab, managers);
  if (ptyId === undefined || managers.pty.terminalIdFor(LAUNCH_LABEL) !== ptyId
    || !managers.pty.isRunningFor(ptyId, [LAUNCH_LABEL])) {
    throw new Error('could not open the launch shell: the shell plugin opened no valid launch shell');
  }
}
