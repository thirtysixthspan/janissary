// Measuring the running app from a driver: the tab strip, the active tab's body, the command bar, and
// whatever the app raises over the top. Everything here reads the DOM the client actually renders, so
// a driver's evidence is what a user would have seen rather than what the source says should happen.
//
// Two shapes of this app are worth knowing before writing a selector against it.
//
// Every plugin view stays mounted while its tab is hidden (`web/src/MountedViewLayers.tsx`), the
// hidden ones carrying `display: none`. So `document.querySelector('.plugin-tab')` is whichever tab
// mounted first, not the one on screen: scope to the visible `.tab-body` instead, and in a locator
// use `.tab-body:visible`.
//
// And an image or other view tab has no command bar, so a command typed for it has to be typed from
// an agent tab. `runCommand` does that switch itself; a driver that reaches for the command bar
// directly after opening a view tab waits for a selector that never arrives.

/* global document, getComputedStyle */

export const TAB_BODY = '.tab-body:visible';
const COMMAND_INPUT = '.command textarea';

// The tab strip as a row per tab: what it is called, whether it is focused, whether it is marked
// unsaved, and where its name and close control sit — the last of which is a promise about layout,
// so it is measured rather than assumed.
export async function tabs(page) {
  return page.evaluate(() => [...document.querySelectorAll('.tab')].map((element, index) => {
    const nameElement = [...element.querySelectorAll('span')].find(
      (span) => !span.classList.contains('dot')
        && !span.classList.contains('tab-dirty')
        && !span.classList.contains('tab-badge'),
    );
    const close = element.querySelector('.tab-close');
    const dot = element.querySelector('.dot');
    const tab = element.getBoundingClientRect();
    const name = nameElement?.getBoundingClientRect();
    const closeBox = close?.getBoundingClientRect();
    return {
      index,
      name: nameElement?.textContent.replaceAll(/\s+/g, ' ').trim() ?? null,
      active: element.classList.contains('active'),
      dirty: Boolean(element.querySelector('.tab-dirty')),
      dotColor: dot ? getComputedStyle(dot).color : null,
      groupBarColor: getComputedStyle(element).borderTopColor,
      hasClose: Boolean(close),
      closeIsLastChild: close ? element.lastElementChild === close : null,
      gapNameToClose: name && closeBox ? Math.round(closeBox.left - name.right) : null,
      distanceCloseToTabEdge: closeBox ? Math.round(tab.right - closeBox.right) : null,
    };
  }));
}

// A compact form of the same thing for a driver's own notes: `landscape.png * [active]`.
export async function tabSummary(page) {
  const rows = await tabs(page);
  return rows.map((row) => `${row.name ?? '?'}${row.dirty ? ' *' : ''}${row.active ? ' [active]' : ''}`);
}

// Types a command and waits for the app to answer it. A view tab has no command bar, so the first
// agent tab in the strip is focused first — that is also what a user does to get a command line back.
export async function runCommand(page, text, { agentTab = 0, settle = 800 } = {}) {
  if (await page.locator(COMMAND_INPUT).count() === 0) {
    await page.locator('.tab').nth(agentTab).click();
    await page.waitForSelector(COMMAND_INPUT, { timeout: 10_000 });
  }
  const input = page.locator(COMMAND_INPUT).first();
  await input.click();
  await input.fill('');
  await input.type(text, { delay: 10 });
  await input.press('Enter');
  await page.waitForTimeout(settle);
}

// Repeats a key, optionally under modifiers, with a beat between presses so a listener that
// re-renders per keypress is observed once per press rather than once per burst.
export async function press(page, key, { times = 1, modifiers = [], settle = 80 } = {}) {
  for (let index = 0; index < times; index += 1) {
    for (const modifier of modifiers) await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    for (const modifier of modifiers.toReversed()) await page.keyboard.up(modifier);
    await page.waitForTimeout(settle);
  }
}

export async function dialogs(page) {
  return page.evaluate(() => [...document.querySelectorAll('[role="dialog"], .modal')].map((dialog) => ({
    text: dialog.textContent.replaceAll(/\s+/g, ' ').trim().slice(0, 300),
    buttons: [...dialog.querySelectorAll('button')].map((button) => button.textContent.trim()),
  })));
}

export async function notifications(page) {
  return page.evaluate(() => [...document.querySelectorAll('.toast, [class*="toast"]')]
    .map((element) => element.textContent.replaceAll(/\s+/g, ' ').trim()));
}

// Everything the page asked the server for, for the lifetime of the returned reader. A spec that
// promises a request count, or one request per file, is checked by counting rather than by reading
// the source. The token is masked: a request log is evidence, and evidence gets pasted into reports.
export function watchRequests(page, match = (url) => url.includes('/open/')) {
  const seen = [];
  page.on('request', (request) => {
    const url = request.url();
    if (match(url)) seen.push(url.replaceAll(/([?&]token=)[^&]+/g, '$1…'));
  });
  return {
    seen,
    reset: () => { seen.length = 0; },
  };
}
