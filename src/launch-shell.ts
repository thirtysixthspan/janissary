import type { Managers } from './managers.js';

// The tab every launch opens: a zsh shell tab, labelled `janus`, opened before the server listens so
// no window ever sees an empty strip. It comes from the bundled shell plugin like any other shell,
// through a launch origin rather than a tab — there is no tab yet to open it from.
export const LAUNCH_LABEL = 'janus';
const SHELL_PLUGIN = 'shell';
const SHELL_COMMAND = 'zsh';

// Throws when no tab came of it — no zsh to run, or a shell plugin that failed or is disabled — so
// the launch stops with the reason instead of serving an application with no tab to type into.
export async function openLaunchShell(managers: Managers): Promise<void> {
  await managers.plugins.runCommand(SHELL_PLUGIN, SHELL_COMMAND, {
    label: LAUNCH_LABEL, command: SHELL_COMMAND, launch: true,
  });
  if (managers.tab.tabs.length > 0) return;
  const reason = managers.plugins.statusFor(SHELL_PLUGIN)?.reason ?? 'the shell plugin opened no tab';
  throw new Error(`could not open the launch shell: ${reason}`);
}
