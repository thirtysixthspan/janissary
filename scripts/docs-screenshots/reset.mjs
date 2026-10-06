// Returns the running app to its launch state between shots. One janissary instance for the whole
// run means a shot inherits whatever the last one left behind — tabs, transcripts, per-tab command
// history, schedules, database connections, workspace clones, and files written into the working
// directory. Clearing a transcript is a command; clearing a tab's history and its connections is
// not, so the reset closes every tab, including the launch shell, and opens a new shell in its place.
import { clearCommandBar, typeCommand } from './command-bar.mjs';
import { restoreWorkDirectory } from './scratch.mjs';
import {
  aliasActiveTab, closeInactiveTabs, countTabs, focusIdleCommandTab, waitForActiveTab, waitForActiveTabOtherThan,
} from './tabs.mjs';

// What a freshly launched janissary shows: one zsh shell tab named `janus`. A typed `zsh` takes a
// random agent-pool name instead, so the reset gives the new shell the display alias `janus` and the
// tab-strip shots read the same on every run. Joining the staging tab's group, it keeps the same
// group-coloured top border as the one it replaces; its dot is whatever `distinctColor` picks against
// the staging tab's, not the launch blue, since no typed command sets a new tab's dot colour.
const ROOT_LABEL = 'janus';
const SHELL_COMMAND = 'zsh';

// The throwaway tab the reset types from. The old shell is closed before the new one opens, so one
// tab stands in between the two. An agent tab, so nothing the reset types reaches a zsh. Every
// command the reset types lands here, and this tab is closed before the shot runs, which is why the
// tab a shot stages in has never had a command typed into it.
const STAGING_LABEL = 'resetting';

// Unworkspaced, because the shell opened from it inherits its workspace: the starting shell has to
// start unconfined at the launch directory, as the launch shell does.
const STAGING_COMMAND = `agent ${STAGING_LABEL} --no-workspace`;

// A shot can end with a picker, a dialog, or a half-typed command still on screen; all of it has to
// go before the reset can read the tab strip or type into the command bar.
async function dismissOverlays(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// `restore` is injectable for the same reason `connectAttached`'s sleep is: a test can drive the
// whole choreography against a fake page without a scratch git repository on disk.
export async function resetApp(page, scratch, options = {}) {
  const restore = options.restore ?? restoreWorkDirectory;
  try {
    await dismissOverlays(page);
    await focusIdleCommandTab(page);
    // Everything the shot opened goes before the first command is typed, not after: a tab left
    // running a long command queues what is typed into it, and closing it takes that command with
    // it. The tab focused above is the one survivor, and it was chosen for being idle.
    await closeInactiveTabs(page);
    await clearCommandBar(page);
    await typeCommand(page, STAGING_COMMAND);
    await waitForActiveTab(page, STAGING_LABEL);
    await closeInactiveTabs(page);
    await typeCommand(page, SHELL_COMMAND);
    await waitForActiveTabOtherThan(page, STAGING_LABEL);
    // Through the strip's own rename field rather than a typed `rename`, which would enter the new
    // shell's command history — the history-picker shot photographs exactly that history.
    await aliasActiveTab(page, ROOT_LABEL);
    await waitForActiveTab(page, ROOT_LABEL);
    await closeInactiveTabs(page);
    const remaining = await countTabs(page);
    if (remaining !== 1) throw new Error(`reset left ${remaining} tabs open, not 1`);
  } finally {
    // Runs even when the reset failed, so a half-done reset cannot leave a file the shot wrote in
    // the next shot's file tree.
    restore(scratch);
  }
}
