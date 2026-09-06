// Returns the running app to its launch state between shots. One janissary instance for the whole
// run means a shot inherits whatever the last one left behind — tabs, transcripts, per-tab command
// history, schedules, database connections, workspace clones, and files written into the working
// directory. Clearing a transcript is a command; clearing a tab's history and its connections is
// not, so the reset closes every tab, including the root one, and makes a new `janus`.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clearCommandBar, typeCommand } from './command-bar.mjs';
import { restoreWorkDirectory } from './scratch.mjs';
import { closeInactiveTabs, countTabs, focusIdleCommandTab, waitForActiveTab } from './tabs.mjs';

// What `makeRootTab()` gives a freshly launched janissary. Five shots photograph the tab strip, so
// the recreated tab has to carry the same label, the same dot colour, and the same group-coloured
// top border as the one it replaces.
const ROOT_LABEL = 'janus';
const ROOT_COLOR = '#5b9cff';

// The throwaway tab the reset types from. `agent janus` cannot be typed while the old `janus` is
// open — the label is taken — and cannot be typed at all once it is closed, so one tab stands in
// between the two. Every command the reset types lands here, and this tab is closed before the shot
// runs, which is why the tab a shot stages in has never had a command typed into it.
const STAGING_LABEL = 'resetting';

// Written into the scratch's own `profiles/` directory and removed again by the work-directory
// restore, so it exists only between shots and is never in a screenshot. `profile launch` is the
// only creation path that sets a new tab's colours: `placeAgent` otherwise picks one with
// `distinctColor(<colours in use>)`, which cannot return the root tab's blue while the staging tab
// is open.
const RESET_PROFILE = 'docs-screenshot-reset';

export function resetProfile() {
  return {
    tabs: [
      {
        type: 'agent',
        name: ROOT_LABEL,
        active: false,
        // `$root` expands to the launch directory, which is the cwd the root tab starts with.
        cwd: '$root',
        color: ROOT_COLOR,
        number: 1,
        group: 1,
        focus: true,
      },
    ],
  };
}

function writeResetProfile(scratch) {
  const directory = path.join(scratch.work, 'profiles');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${RESET_PROFILE}.json`);
  writeFileSync(file, JSON.stringify(resetProfile(), null, 2) + '\n');
}

// A shot can end with a picker, a dialog, or a half-typed command still on screen; all of it has to
// go before the reset can read the tab strip or type into the command bar.
async function dismissOverlays(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// `writeProfile` and `restore` are injectable for the same reason `connectAttached`'s sleep is: a
// test can drive the whole choreography against a fake page without a scratch git repository on disk.
export async function resetApp(page, scratch, options = {}) {
  const writeProfile = options.writeProfile ?? writeResetProfile;
  const restore = options.restore ?? restoreWorkDirectory;
  try {
    await dismissOverlays(page);
    await focusIdleCommandTab(page);
    // Everything the shot opened goes before the first command is typed, not after: a tab left
    // running a long command queues what is typed into it, and closing it takes that command with
    // it. The tab focused above is the one survivor, and it was chosen for being idle.
    await closeInactiveTabs(page);
    await clearCommandBar(page);
    await typeCommand(page, `agent ${STAGING_LABEL}`);
    await waitForActiveTab(page, STAGING_LABEL);
    await closeInactiveTabs(page);
    writeProfile(scratch);
    await typeCommand(page, `profile launch ${RESET_PROFILE}`);
    await waitForActiveTab(page, ROOT_LABEL);
    await closeInactiveTabs(page);
    const remaining = await countTabs(page);
    if (remaining !== 1) throw new Error(`reset left ${remaining} tabs open, not 1`);
  } finally {
    // Also what removes the reset profile: it is untracked in the fixture repository, like
    // everything else a shot wrote. Runs even when the reset failed, so a half-done reset cannot
    // leave the profile file in the next shot's file tree.
    restore(scratch);
  }
}
