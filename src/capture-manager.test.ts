import { describe, it, expect, vi } from 'vitest';
import { CaptureManager } from './capture-manager.js';
import { makeTab } from './tab/index.js';
import type { Managers } from './managers.js';

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  const tab = makeTab('main', 'red');
  return {
    tab: {
      findIndex: vi.fn((label: string) => (label === 'main' ? 0 : -1)),
      tabs: [tab],
    },
    shell: { run: vi.fn() },
    acp: { run: vi.fn() },
    browser: { runInteractive: vi.fn() },
    command: { executeCommand: vi.fn() },
    database: { openDbs: vi.fn(() => []) },
    ...overrides,
  } as unknown as Managers;
}

describe('CaptureManager.run', () => {
  it('runs a non-interactive shell command through the shell manager', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'shell echo hi', callback);

    expect(managers.shell.run).toHaveBeenCalledWith('main', 'echo hi', { onComplete: expect.any(Function) });
    const options = (managers.shell.run as ReturnType<typeof vi.fn>).mock.calls[0][2];
    options.onComplete('hi');
    expect(callback).toHaveBeenCalledWith('hi');
  });

  it('refuses an interactive shell command without invoking the shell manager', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'shell vim', callback);

    expect(managers.shell.run).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('Cannot run interactive command remotely: vim');
  });

  it('reports when the target tab is not found', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('missing', 'close', callback);

    expect(callback).toHaveBeenCalledWith('Tab not found');
  });

  it('routes an acp command directly to the acp manager', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'acp hello', callback);

    expect(managers.acp.run).toHaveBeenCalledWith('main', 'acp hello', callback);
  });

  it('routes a browser command directly to the browser manager', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'browser https://example.com', callback);

    expect(managers.browser.runInteractive).toHaveBeenCalledWith('browser https://example.com', 'main', callback);
  });

  it('executes a matched command and reports its logged output', () => {
    const tab = makeTab('main', 'red');
    const managers = makeManagers({
      tab: {
        findIndex: vi.fn(() => 0),
        tabs: [tab],
      },
      command: {
        executeCommand: vi.fn(() => {
          tab.log.push({ input: 'close', output: 'closed tab' });
        }),
      },
    } as unknown as Partial<Managers>);
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'close', callback);

    expect(managers.command.executeCommand).toHaveBeenCalledWith('close', 'close', 'main', 0);
    expect(callback).toHaveBeenCalledWith('closed tab');
  });

  it('falls back to routing an unknown command', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'totally-bogus-command', callback);

    expect(callback).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
  });
});
