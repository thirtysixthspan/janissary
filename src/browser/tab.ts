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
import { errorText } from '../error-text.js';

type Launch = { release: { released: boolean }; entry: Promise<Entry> };

export class BrowserManager {
  private browsers = new Map<string, Entry>();
  // A launch still in flight, per label. Recorded before it is awaited, so overlapping first uses
  // share one Chromium and teardown can see a launch it has to release.
  private launching = new Map<string, Launch>();

  constructor(private managers: Managers) {}

  has(label: string): boolean {
    return this.browsers.has(label);
  }

  // Live window state for a tab (for the connections panel / `connection list`).
  info(label: string): { ids: string[]; mode: string; current?: string } | null {
    const entry = this.browsers.get(label);
    return entry ? { ids: entry.browser.windowIds(), mode: entry.browser.mode, current: entry.current } : null;
  }

  // A launch still in flight is released rather than waited for: it closes the browser it opened as
  // soon as that settles, instead of registering it under a label that is gone or reused.
  closeTab(label: string): void {
    const launch = this.launching.get(label);
    if (launch) { launch.release.released = true; this.launching.delete(label); }
    const entry = this.browsers.get(label);
    if (entry) { void entry.browser.close(); this.browsers.delete(label); }
  }

  closeAll(): void {
    for (const launch of this.launching.values()) launch.release.released = true;
    this.launching.clear();
    for (const [, entry] of this.browsers) void entry.browser.close();
    this.browsers.clear();
  }

  // The tab's browser, launching it on first use. Every caller for a label shares one launch.
  private async entryFor(label: string, headless: boolean): Promise<Entry> {
    const existing = this.browsers.get(label);
    if (existing) return existing;
    let launch = this.launching.get(label);
    if (!launch) {
      const release = { released: false };
      launch = { release, entry: this.launch(label, headless, release) };
      this.launching.set(label, launch);
    }
    return await launch.entry;
  }

  private async launch(label: string, headless: boolean, release: { released: boolean }): Promise<Entry> {
    try {
      const browser = await launchTabBrowser(headless);
      if (release.released) {
        void browser.close();
        throw new Error('the tab closed while its browser was launching');
      }
      const entry: Entry = { browser, counter: 0 };
      this.browsers.set(label, entry);
      return entry;
    } finally {
      if (this.launching.get(label)?.release === release) this.launching.delete(label);
    }
  }

  dispose(): void {
    this.closeAll();
  }

  // Run a `browser ...` command against a tab's browser, returning text to show/return. Shared by
  // the interactive `browser` command, `connection close browser:*`, and the ACP tool loop.
  async run(label: string, command: string): Promise<string> {
    const parsed = parseBrowserCommand(command);
    if ('error' in parsed) return parsed.error;

    try {
      switch (parsed.action) {
        case 'open': {
          const running = this.browsers.has(label) || this.launching.has(label);
          const entry = await this.entryFor(label, !parsed.headed);
          const notice = running && parsed.headed && entry.browser.mode === 'headless'
            ? ' (this tab is already running headless; close all windows to relaunch headed)' : '';
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
          return await runGoto(await this.entryFor(label, true), parsed.url);
        }
        case 'eval': {
          return await runEval(await this.entryFor(label, true), parsed.js);
        }
        case 'content': {
          return await runContent(await this.entryFor(label, true));
        }
        case 'shot': {
          return await runShot(await this.entryFor(label, true));
        }
      }
    } catch (error) {
      return `Browser error: ${errorText(error)}`;
    }
    return '';
  }

  runInteractive(command: string, label: string, onDone?: (output: string) => void): void {
    this.managers.tab.startRunning(label, command);
    void this.run(label, command)
      .then((out) => { this.managers.tab.finishRunning(label, out, { command }); onDone?.(out); })
      .catch((error) => {
        const message = `Browser error: ${errorText(error)}`;
        this.managers.tab.finishRunning(label, message, { command });
        onDone?.(message);
      });
  }
}
