import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserManager } from './tab.js';
import type { Managers } from '../managers.js';
import type { BrowserWindow, TabBrowser } from '../types.js';

const { launchTabBrowser } = vi.hoisted(() => ({ launchTabBrowser: vi.fn() }));
vi.mock('./index.js', () => ({ launchTabBrowser }));

function makeWindow(id: string): BrowserWindow {
  return {
    id,
    goto: vi.fn(async () => `title — https://example.com/${id}`),
    eval: vi.fn(async () => '"result"'),
    shot: vi.fn(async () => `/tmp/${id}.png`),
    content: vi.fn(async () => `content of ${id}`),
    url: vi.fn(() => `https://example.com/${id}`),
  };
}

function makeTabBrowser(mode: 'headless' | 'headed' = 'headless'): TabBrowser {
  const windows = new Map<string, BrowserWindow>();
  return {
    mode,
    openWindow: vi.fn(async (id: string) => {
      const window = makeWindow(id);
      windows.set(id, window);
      return window;
    }),
    window: vi.fn((id: string) => windows.get(id)),
    closeWindow: vi.fn(async (id: string) => { windows.delete(id); }),
    windowIds: vi.fn(() => [...windows.keys()]),
    close: vi.fn(async () => { windows.clear(); }),
  };
}

function makeManagers(): Managers {
  return {
    tab: {
      startRunning: vi.fn(),
      finishRunning: vi.fn(),
    },
  } as unknown as Managers;
}

describe('BrowserManager', () => {
  beforeEach(() => {
    launchTabBrowser.mockReset();
    launchTabBrowser.mockImplementation(async () => makeTabBrowser());
  });

  it('has() reports whether a tab has a browser', async () => {
    const manager = new BrowserManager(makeManagers());
    expect(manager.has('main')).toBe(false);
    await manager.run('main', 'open');
    expect(manager.has('main')).toBe(true);
  });

  it('info() returns null for an unknown tab and details for a known one', async () => {
    const manager = new BrowserManager(makeManagers());
    expect(manager.info('main')).toBeNull();
    await manager.run('main', 'open');
    const info = manager.info('main');
    expect(info?.mode).toBe('headless');
    expect(info?.ids.length).toBe(1);
  });

  it('open launches a browser and opens a window', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'open');
    expect(result).toContain('Opened browser window w1');
    expect(launchTabBrowser).toHaveBeenCalledWith(true);
  });

  it('open --headed launches a headed browser', async () => {
    const manager = new BrowserManager(makeManagers());
    launchTabBrowser.mockImplementation(async () => makeTabBrowser('headed'));
    const result = await manager.run('main', 'open --headed');
    expect(launchTabBrowser).toHaveBeenCalledWith(false);
    expect(result).toContain('(headed)');
  });

  it('list reports no windows when none are open', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'list');
    expect(result).toBe('No browser windows.');
  });

  it('list shows the current window marked with a star', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    const result = await manager.run('main', 'list');
    expect(result).toBe('* browser:w1');
  });

  it('use switches the current window', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    await manager.run('main', 'goto https://second.example.com');
    const opened = await manager.run('main', 'open');
    expect(opened).toContain('w2');
    const result = await manager.run('main', 'use w1');
    expect(result).toBe('Using browser window w1.');
  });

  it('use reports an error for an unknown window id', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    const result = await manager.run('main', 'use bogus');
    expect(result).toBe('No browser window bogus.');
  });

  it('goto navigates the current window, auto-launching one if needed', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'goto https://example.com');
    expect(result).toBe('title — https://example.com/w1');
  });

  it('eval runs javascript in the current window', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'eval 1+1');
    expect(result).toBe('"result"');
  });

  it('content returns the current page content', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'content');
    expect(result).toBe('content of w1');
  });

  it('shot returns the screenshot path', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'shot');
    expect(result).toContain('/tmp/w1.png');
  });

  it('close closes the current window', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    const result = await manager.run('main', 'close');
    expect(result).toBe('Closed connection browser:w1.');
    expect(manager.info('main')).toBeNull();
  });

  it('close reports when there is no current window', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'close');
    expect(result).toBe('No browser window to close.');
  });

  it('window close <id> closes a specific window', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    const result = await manager.run('main', 'window close w1');
    expect(result).toBe('Closed connection browser:w1.');
  });

  it('window close reports an error for an unknown connection', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'window close bogus');
    expect(result).toBe('No open connection browser:bogus.');
  });

  it('returns the parser error for an invalid command', async () => {
    const manager = new BrowserManager(makeManagers());
    const result = await manager.run('main', 'bogus');
    expect(result).toContain('Usage: browser');
  });

  it('catches errors thrown while running an action', async () => {
    const manager = new BrowserManager(makeManagers());
    launchTabBrowser.mockImplementation(async () => { throw new Error('boom'); });
    const result = await manager.run('main', 'open');
    expect(result).toBe('Browser error: boom');
  });

  it('closeTab closes and removes a tab browser', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    manager.closeTab('main');
    expect(manager.has('main')).toBe(false);
  });

  it('closeTab is a no-op for an unknown tab', () => {
    const manager = new BrowserManager(makeManagers());
    expect(() => manager.closeTab('missing')).not.toThrow();
  });

  it('closeAll closes every tracked browser', async () => {
    const manager = new BrowserManager(makeManagers());
    await manager.run('main', 'open');
    await manager.run('other', 'open');
    manager.closeAll();
    expect(manager.has('main')).toBe(false);
    expect(manager.has('other')).toBe(false);
  });

  it('runInteractive marks the tab running and reports the result via the tab manager', async () => {
    const managers = makeManagers();
    const manager = new BrowserManager(managers);
    const onDone = vi.fn();

    manager.runInteractive('goto https://example.com', 'main', onDone);
    await vi.waitFor(() => {
      expect(managers.tab.finishRunning).toHaveBeenCalled();
    });

    expect(managers.tab.startRunning).toHaveBeenCalledWith('main', 'goto https://example.com');
    expect(managers.tab.finishRunning).toHaveBeenCalledWith('main', 'title — https://example.com/w1');
    expect(onDone).toHaveBeenCalledWith('title — https://example.com/w1');
  });

  it('runInteractive reports an error through the tab manager when the run rejects', async () => {
    const managers = makeManagers();
    const manager = new BrowserManager(managers);
    const onDone = vi.fn();
    launchTabBrowser.mockImplementation(async () => { throw new Error('nope'); });

    // `run` catches its own errors and never rejects, so this exercises the resolved path;
    // the .catch() branch in runInteractive only fires if `run` itself throws synchronously,
    // which parseBrowserCommand can do for malformed input outside its own try/catch.
    manager.runInteractive('open', 'main', onDone);
    await vi.waitFor(() => {
      expect(managers.tab.finishRunning).toHaveBeenCalled();
    });

    expect(managers.tab.finishRunning).toHaveBeenCalledWith('main', 'Browser error: nope');
    expect(onDone).toHaveBeenCalledWith('Browser error: nope');
  });
});
