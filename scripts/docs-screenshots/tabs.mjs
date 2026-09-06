// Driving the tab strips from outside the app. Tabs are closed by clicking the close button
// `TabItem` renders, never by typing `close`: a typed command leaves a transcript line and a
// history entry behind, and the shot that photographs the history picker has to see its own three
// commands and nothing the reset did.
import { commandBar } from './command-bar.mjs';

// The left pane's strip, which is the one that always exists — a tab with no `pane` of its own is a
// left-pane tab, and the right strip renders only while the centre area is split.
const CENTER_TAB = '.center-strip-left .tab';
const ACTIVE_CENTER_TAB = '.center-strip-left .tab.active';
// Every tab a reset may close: the left strip's inactive tabs, the right strip's tabs outright (a
// split pane has an active tab of its own, which `:not(.active)` would spare), and the docked tabs
// in either sidebar and in the reporting section, which likewise keep selections of their own.
const CLOSABLE_TABS = [
  '.center-strip-left .tab:not(.active)',
  '.center-strip-right .tab',
  '.sidebar .tab',
  '.reporting-strip .tab',
].join(', ');
const CLOSE_BUTTON = '.tab-close';
const BUSY_DOT = '.dot.busy';
const MODAL_BUTTON = '.modal-button';
const DISCARD_LABEL = "Don't Save";
const SETTLE_MS = 250;
const ACTIVE_TAB_TIMEOUT_MS = 15_000;
// A shot can leave a long command running (`tabs-overview` starts a 30-second sleep), and the tab
// it runs in queues everything typed after it instead of running it. Only reached when no idle tab
// offers a command bar at all, so the wait is for a real condition rather than a routine delay.
const IDLE_TIMEOUT_MS = 45_000;
// Far above any shot's tab count. A loop that reaches it is clicking a close button that is not
// closing anything, which is a failure to report rather than one to spin on.
const CLOSE_LIMIT = 40;

// Clicked near the left edge, over the status dot, so the click can never land on the close button
// at the tab's right edge.
const SELECT_POSITION = { position: { x: 8, y: 8 } };

// Closing a tab holding unsaved work raises the save dialog (the editor shot types into
// `sample.ts` and never saves). Discard rather than save: the fixture file has to stay as committed.
async function discardUnsavedChanges(page) {
  const discard = page.locator(MODAL_BUTTON, { hasText: DISCARD_LABEL });
  const raised = await discard.isVisible();
  if (!raised) return;
  await discard.click();
  await page.waitForTimeout(SETTLE_MS);
}

// The dialog is looked for after the settle, not before it: a close click that raises one has not
// rendered it yet at the moment the click resolves, and a tab whose dialog was missed is simply
// still there on the next pass.
export async function closeInactiveTabs(page) {
  for (let closed = 0; closed < CLOSE_LIMIT; closed += 1) {
    const others = page.locator(CLOSABLE_TABS);
    const remaining = await others.count();
    if (remaining === 0) return;
    await others.first().locator(CLOSE_BUTTON).click();
    await page.waitForTimeout(SETTLE_MS);
    await discardUnsavedChanges(page);
  }
  throw new Error('the tabs a shot left open would not close');
}

export async function waitForIdleActiveTab(page) {
  const busy = page.locator(`${ACTIVE_CENTER_TAB} ${BUSY_DOT}`);
  await busy.waitFor({ state: 'detached', timeout: IDLE_TIMEOUT_MS });
}

// Picks the tab the reset will type its commands into, and focuses it. Two things disqualify a tab:
// having no command bar (only the active tab renders one, and an editor, image or file-navigator tab
// has none of its own), and being busy (a busy tab queues what is typed into it instead of running
// it, which is indistinguishable from a command that silently did nothing). An idle tab with a
// command bar wins outright; a busy one is kept only as a fallback to wait on, since the alternative
// is failing a reset that would have worked a moment later.
export async function focusIdleCommandTab(page) {
  const tabs = page.locator(CENTER_TAB);
  const count = await tabs.count();
  let fallback;
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const busy = await tab.locator(BUSY_DOT).count();
    await tab.click(SELECT_POSITION);
    await page.waitForTimeout(SETTLE_MS);
    const hasCommandBar = await commandBar(page).isVisible();
    if (!hasCommandBar) continue;
    if (busy === 0) return;
    fallback ??= index;
  }
  if (fallback === undefined) throw new Error('no tab with a command bar to reset from');
  await tabs.nth(fallback).click(SELECT_POSITION);
  await waitForIdleActiveTab(page);
}

export async function waitForActiveTab(page, label) {
  const tab = page.locator(ACTIVE_CENTER_TAB, { hasText: label });
  await tab.waitFor({ state: 'visible', timeout: ACTIVE_TAB_TIMEOUT_MS });
}

export async function countTabs(page) {
  return await page.locator('.tab').count();
}
