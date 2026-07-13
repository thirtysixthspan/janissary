import { launchTabBrowser } from './index.js';
import { parseBrowserCommand } from './command.js';
import type { Managers } from '../managers.js';
import {
  closeBrowserWindow,
  formatList,
  runContent,
  runEval,
  runGoto,
  runShot,
} from './tab-helpers.js';
import type { Entry } from './tab-helpers.js';

export class BrowserManager {
  private browsers = new Map<string, Entry>();

  constructor(private managers: Managers) {}

  has(label: string): boolean {
    return this.browsers.has(label);
  }

  // Live window state for a tab (for the connections panel / `connection list`).
  info(label: string): { ids: string[]; mode: string; current?: string } | null {
    const entry = this.browsers.get(label);
    return entry ? { ids: entry.browser.windowIds(), mode: entry.browser.mode, current: entry.current } : null;
  }

  closeTab(label: string): void {
    const entry = this.browsers.get(label);
    if (entry) { void entry.browser.close(); this.browsers.delete(label); }
  }

  closeAll(): void {
    for (const [, entry] of this.browsers) void entry.browser.close();
    this.browsers.clear();
  }

  // Run a `browser ...` command against a tab's browser, returning text to show/return. Shared by
  // the interactive `browser` command, `connection close browser:*`, and the ACP tool loop.
  async run(label: string, command: string): Promise<string> {
    const parsed = parseBrowserCommand(command);
    if ('error' in parsed) return parsed.error;

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
          return formatList(this.browsers.get(label));
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
          return await closeBrowserWindow(this.browsers, label, entry.current);
        }
        case 'closeWindow': {
          return await closeBrowserWindow(this.browsers, label, parsed.id);
        }
        case 'goto': {
          return await runGoto(this.browsers, label, parsed.url);
        }
        case 'eval': {
          return await runEval(this.browsers, label, parsed.js);
        }
        case 'content': {
          return await runContent(this.browsers, label);
        }
        case 'shot': {
          return await runShot(this.browsers, label);
        }
      }
    } catch (error) {
      return `Browser error: ${error instanceof Error ? error.message : String(error)}`;
    }
    return '';
  }

  runInteractive(command: string, label: string, onDone?: (output: string) => void): void {
    this.managers.tab.startRunning(label, command);
    void this.run(label, command)
      .then((out) => { this.managers.tab.finishRunning(label, out); onDone?.(out); })
      .catch((error) => {
        const message = `Browser error: ${error instanceof Error ? error.message : String(error)}`;
        this.managers.tab.finishRunning(label, message);
        onDone?.(message);
      });
  }
}
