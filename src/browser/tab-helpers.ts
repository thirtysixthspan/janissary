import { launchTabBrowser } from './index.js';
import type { BrowserWindow, TabBrowser } from './types.js';

// `state` rides on the live record too, so the object the launch hands out is the very object the
// map holds: the window counter and current window a caller sets are the ones the next caller reads.
export type LiveEntry = { state: 'live'; browser: TabBrowser; current?: string; counter: number };

// `claim` is this launch's identity: the record in the map belongs to the launch that wrote it, which
// is how the launch's own outcome tells a record a `closeTab` dropped (or a later launch replaced)
// from the one it is still entitled to fill in.
type Launching = { state: 'launching'; claim: object; launch: Promise<LiveEntry> };

// What a label holds: the live browser, or the launch that is about to produce one. The launching
// form is in the map from the moment the launch starts, so a second first use joins that launch
// instead of starting a second process, and a tab closed meanwhile has something to release.
export type Entry = Launching | LiveEntry;

// The live half of a label's record, or nothing: a launch still in flight has no browser to read a
// window, a mode, or the current window id from yet.
export function liveEntry(entry: Entry | undefined): LiveEntry | undefined {
  return entry?.state === 'live' ? entry : undefined;
}

// Whether the label still holds exactly this launch's record. A `closeTab` mid-launch drops it, and
// the same label launching again replaces it, so the label alone cannot answer this.
function stillPending(browsers: Map<string, Entry>, label: string, claim: object): boolean {
  const record = browsers.get(label);
  return record?.state === 'launching' && record.claim === claim;
}

// This label's entry, launching the tab's browser if nothing holds one yet. The record goes in
// before the launch is awaited, so an overlapping first use finds it and waits on the same launch,
// and a `closeTab` that lands mid-launch finds a record to drop. Every caller receives the same
// `LiveEntry` object once it lands, so the window counter stays shared between them.
export function entryFor(
  browsers: Map<string, Entry>, label: string, headless: boolean,
): Promise<LiveEntry> {
  const existing = browsers.get(label);
  if (existing) return existing.state === 'live' ? Promise.resolve(existing) : existing.launch;

  const claim = {};
  const pending: Launching = {
    state: 'launching',
    claim,
    launch: (async () => {
      try {
        const browser = await launchTabBrowser(headless);
        const entry: LiveEntry = { state: 'live', browser, counter: 0 };
        // A record dropped mid-launch already scheduled this browser's close, so filling the label
        // back in would hand a closing browser to whatever asks for it next.
        if (stillPending(browsers, label, claim)) browsers.set(label, entry);
        return entry;
      } catch (error) {
        // A launch that never arrives must not leave the label holding a browser that does not exist.
        if (stillPending(browsers, label, claim)) browsers.delete(label);
        throw error;
      }
    })(),
  };
  browsers.set(label, pending);
  return pending.launch;
}

// Close whatever a label's record holds: the live browser now, or the one an in-flight launch is
// about to produce. The caller has dropped the record already, so a launch that lands afterwards
// closes its own browser rather than being inherited by a later use of the same label.
export function releaseEntry(entry: Entry): void {
  if (entry.state === 'live') { void entry.browser.close(); return; }
  void entry.launch.then((live) => live.browser.close(), () => {});
}

export async function ensureCurrentWindow(
  browsers: Map<string, Entry>,
  label: string,
): Promise<BrowserWindow> {
  const entry = await entryFor(browsers, label, true);
  if (!entry.current || !entry.browser.window(entry.current)) {
    const id = `w${++entry.counter}`;
    await entry.browser.openWindow(id);
    entry.current = id;
  }
  return entry.browser.window(entry.current)!;
}

export async function runGoto(browsers: Map<string, Entry>, label: string, url: string): Promise<string> {
  const page = await ensureCurrentWindow(browsers, label);
  return await page.goto(url);
}

export async function runEval(browsers: Map<string, Entry>, label: string, js: string): Promise<string> {
  const page = await ensureCurrentWindow(browsers, label);
  return await page.eval(js);
}

export async function runContent(browsers: Map<string, Entry>, label: string): Promise<string> {
  const page = await ensureCurrentWindow(browsers, label);
  return await page.content();
}

export async function runShot(browsers: Map<string, Entry>, label: string): Promise<string> {
  const page = await ensureCurrentWindow(browsers, label);
  const path = await page.shot();
  const opened = process.platform === 'darwin' ? ' (opening in Preview)' : '';
  return `Screenshot saved: ${path}${opened}`;
}

export async function closeBrowserWindow(browsers: Map<string, Entry>, label: string, id: string): Promise<string> {
  const entry = liveEntry(browsers.get(label));
  if (!entry || !entry.browser.window(id)) return `No open connection browser:${id}.`;
  await entry.browser.closeWindow(id);
  if (entry.current === id) entry.current = entry.browser.windowIds()[0];
  if (entry.browser.windowIds().length === 0) { await entry.browser.close(); browsers.delete(label); }
  return `Closed connection browser:${id}.`;
}

export function formatList(entry: Entry | undefined): string {
  const live = liveEntry(entry);
  if (!live) return 'No browser windows.';
  const ids = live.browser.windowIds();
  if (ids.length === 0) return 'No browser windows.';
  return ids.map((id) => `${id === live.current ? '* ' : '  '}browser:${id}`).join('\n');
}
