import { describe, it, expect, vi } from 'vitest';
import { CaptureManager } from './manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';

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

    expect(managers.shell.run).toHaveBeenCalledWith('main', 'echo hi', { onComplete: expect.any(Function), detect: false });
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

  // `msg <tab> request …` is the second entry point into `AcpManager.run`. It needs no change to
  // reach a remote agent: a request addressed to one starts a remote ACP session on the same path.
  it('routes a request to a remote agent tab through the same acp manager call', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'acp what is in this workspace', callback);

    expect(managers.acp.run).toHaveBeenCalledWith('main', 'acp what is in this workspace', callback);
  });

  // The still-connecting refusal arrives as the request's answer rather than the requester hanging.
  it('answers a request with whatever the acp manager reports, including a refusal', () => {
    const managers = makeManagers();
    (managers.acp.run as ReturnType<typeof vi.fn>).mockImplementation(
      (_label: string, _command: string, done: (out: string) => void) => { done('ACP: the remote session is still connecting.'); },
    );
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'acp hello', callback);

    expect(callback).toHaveBeenCalledWith('ACP: the remote session is still connecting.');
  });

  it('routes a browser command directly to the browser manager', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'browser https://example.com', callback);

    expect(managers.browser.runInteractive).toHaveBeenCalledWith('browser https://example.com', 'main', callback);
  });

  it('executes a matched command and reports its logged output', async () => {
    const tab = makeTab('main', 'red');
    let finish!: () => void;
    const managers = makeManagers({
      tab: {
        findIndex: vi.fn(() => 0),
        tabs: [tab],
      },
      command: {
        executeCommand: vi.fn(() => new Promise<void>((resolve) => {
          finish = () => {
            tab.log.push({ input: 'close', output: 'closed tab' });
            resolve();
          };
        })),
      },
    } as unknown as Partial<Managers>);
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'close', callback);

    expect(managers.command.executeCommand).toHaveBeenCalledWith('close', 'close', 'main', 0);
    expect(callback).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => { expect(callback).toHaveBeenCalledWith('closed tab'); });
  });

  it('falls back to routing an unknown command', () => {
    const managers = makeManagers();
    const capture = new CaptureManager(managers);
    const callback = vi.fn();

    capture.run('main', 'totally-bogus-command', callback);

    expect(callback).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
  });
});
