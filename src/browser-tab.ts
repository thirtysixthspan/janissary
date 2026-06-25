import { launchTabBrowser } from './browser.js';
import { parseBrowserCommand } from './browser-command.js';
import type { BrowserWindow, TabBrowser } from './types.js';

type Entry = { browser: TabBrowser; current?: string; counter: number };

// Per-tab Playwright browsers, keyed by tab label. Ported from the `runBrowserInTab` /
// `closeBrowserWindow` / `closeTabBrowser` glue that lived in src/cli.tsx. Each tab owns its own
// browser process (so headless/headed can differ) holding one or more isolated windows. Page
// actions (goto/eval/shot/content) auto-launch a headless browser and a window on first use.
export class BrowserManager {
  private browsers = new Map<string, Entry>();

  has(label: string): boolean {
    return this.browsers.has(label);
  }

  // Live window state for a tab (for the connections panel / `connection list`).
  info(label: string): { ids: string[]; mode: string; current?: string } | null {
    const e = this.browsers.get(label);
    return e ? { ids: e.browser.windowIds(), mode: e.browser.mode, current: e.current } : null;
  }

  closeTab(label: string): void {
    const e = this.browsers.get(label);
    if (e) { void e.browser.close(); this.browsers.delete(label); }
  }

  closeAll(): void {
    for (const [, e] of this.browsers) void e.browser.close();
    this.browsers.clear();
  }

  // Run a `browser ...` command against a tab's browser, returning text to show/return. Shared by
  // the interactive `browser` command, `connection close browser:*`, and the ACP tool loop.
  async run(label: string, command: string): Promise<string> {
    const parsed = parseBrowserCommand(command);
    if ('error' in parsed) return parsed.error;

    const ensureCurrent = async (): Promise<BrowserWindow> => {
      let entry = this.browsers.get(label);
      if (!entry) { entry = { browser: await launchTabBrowser(true), counter: 0 }; this.browsers.set(label, entry); }
      if (!entry.current || !entry.browser.window(entry.current)) {
        const id = `w${++entry.counter}`;
        await entry.browser.openWindow(id);
        entry.current = id;
      }
      return entry.browser.window(entry.current)!;
    };

    try {
      switch (parsed.action) {
        case 'open': {
          let entry = this.browsers.get(label);
          const notice = entry && parsed.headed && entry.browser.mode === 'headless'
            ? ' (this tab is already running headless; close all windows to relaunch headed)' : '';
          if (!entry) { entry = { browser: await launchTabBrowser(!parsed.headed), counter: 0 }; this.browsers.set(label, entry); }
          const id = `w${++entry.counter}`;
          await entry.browser.openWindow(id);
          entry.current = id;
          return `Opened browser window ${id} (${entry.browser.mode}).${notice}`;
        }
        case 'list': {
          const entry = this.browsers.get(label);
          const ids = entry?.browser.windowIds() ?? [];
          if (ids.length === 0) return 'No browser windows.';
          return ids.map((id) => `${id === entry!.current ? '* ' : '  '}browser:${id}`).join('\n');
        }
        case 'use': {
          const entry = this.browsers.get(label);
          if (!entry || !entry.browser.window(parsed.id)) return `No browser window ${parsed.id}.`;
          entry.current = parsed.id;
          return `Using browser window ${parsed.id}.`;
        }
        case 'close': {
          const entry = this.browsers.get(label);
          if (!entry?.current) return 'No browser window to close.';
          return await this.closeWindow(label, entry.current);
        }
        case 'closeWindow': {
          return await this.closeWindow(label, parsed.id);
        }
        case 'goto': {
          return await (await ensureCurrent()).goto(parsed.url);
        }
        case 'eval': {
          return await (await ensureCurrent()).eval(parsed.js);
        }
        case 'content': {
          return await (await ensureCurrent()).content();
        }
        case 'shot': {
          const path = await (await ensureCurrent()).shot();
          const opened = process.platform === 'darwin' ? ' (opening in Preview)' : '';
          return `Screenshot saved: ${path}${opened}`;
        }
      }
    } catch (error) {
      return `Browser error: ${error instanceof Error ? error.message : String(error)}`;
    }
    return '';
  }

  private async closeWindow(label: string, id: string): Promise<string> {
    const entry = this.browsers.get(label);
    if (!entry || !entry.browser.window(id)) return `No open connection browser:${id}.`;
    await entry.browser.closeWindow(id);
    if (entry.current === id) entry.current = entry.browser.windowIds()[0];
    if (entry.browser.windowIds().length === 0) { await entry.browser.close(); this.browsers.delete(label); }
    return `Closed connection browser:${id}.`;
  }
}
