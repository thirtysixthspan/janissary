import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockNewBrowserCDPSession = vi.hoisted(() => vi.fn().mockResolvedValue({ send: mockSend }));
const mockConnectOverCDP = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ newBrowserCDPSession: mockNewBrowserCDPSession, close: mockClose }),
);
vi.mock('playwright', () => ({ chromium: { connectOverCDP: mockConnectOverCDP } }));

import { loadFrameEnablerExtension } from './chrome-extension-loader.js';

describe('loadFrameEnablerExtension', () => {
  let profileDir: string;

  beforeEach(() => {
    profileDir = mkdtempSync(path.join(tmpdir(), 'chrome-extension-loader-test-'));
    mockConnectOverCDP.mockClear();
    mockNewBrowserCDPSession.mockClear();
    mockSend.mockClear();
    mockClose.mockClear();
  });

  afterEach(() => {
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('reads the port from DevToolsActivePort and loads the extension over CDP', async () => {
    writeFileSync(path.join(profileDir, 'DevToolsActivePort'), '54321\n/devtools/browser/abc123\n');

    await loadFrameEnablerExtension(profileDir, '/path/to/chrome-extension');

    expect(mockConnectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:54321');
    expect(mockNewBrowserCDPSession).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith('Extensions.loadUnpacked', { path: '/path/to/chrome-extension' });
    expect(mockClose).toHaveBeenCalled();
  });

  it('warns on stderr and gives up when DevToolsActivePort never appears', async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const promise = loadFrameEnablerExtension(profileDir, '/path/to/chrome-extension');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('warning: Chrome frame-enabler extension failed to load'),
    );
    expect(mockConnectOverCDP).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    vi.useRealTimers();
  });
});
