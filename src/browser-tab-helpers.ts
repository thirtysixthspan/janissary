import { launchTabBrowser } from './browser.js';
import type { BrowserWindow, TabBrowser } from './types.js';

export type Entry = { browser: TabBrowser; current?: string; counter: number };

export async function ensureCurrentWindow(
  browsers: Map<string, Entry>,
  label: string,
): Promise<BrowserWindow> {
  let entry = browsers.get(label);
  if (!entry) { entry = { browser: await launchTabBrowser(true), counter: 0 }; browsers.set(label, entry); }
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
  const entry = browsers.get(label);
  if (!entry || !entry.browser.window(id)) return `No open connection browser:${id}.`;
  await entry.browser.closeWindow(id);
  if (entry.current === id) entry.current = entry.browser.windowIds()[0];
  if (entry.browser.windowIds().length === 0) { await entry.browser.close(); browsers.delete(label); }
  return `Closed connection browser:${id}.`;
}

export function formatList(entry: Entry | undefined): string {
  const ids = entry?.browser.windowIds() ?? [];
  if (ids.length === 0) return 'No browser windows.';
  return ids.map((id) => `${id === entry!.current ? '* ' : '  '}browser:${id}`).join('\n');
}
