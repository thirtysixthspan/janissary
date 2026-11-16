import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type * as fileSystemPromises from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame } from '../remote/protocol-frames.js';
import { RemoteFileNavigators } from '../remote/serve-file-navigator.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { REQUEST_DEADLINE_MS } from '../file-navigator/remote/port-requests.js';
import type * as grepModule from './grep.js';
import { FILE_GREP_USAGE, type FileGrepArgs } from './command.js';
import { grepWorkspace } from './grep.js';
import { GREP_TIMEOUT_MS } from './scan.js';
import { grepFilesInTab } from './tab-grep.js';

type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;
type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

const home = vi.hoisted(() => ({ dir: '' }));
const grepControl = vi.hoisted(() => ({
  actual: undefined as typeof grepWorkspace | undefined,
}));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystemPromises>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

vi.mock('./grep.js', async (importOriginal) => {
  const actual = await importOriginal<typeof grepModule>();
  grepControl.actual = actual.grepWorkspace;
  return { ...actual, grepWorkspace: vi.fn(actual.grepWorkspace) };
});

function fakeChannel() {
  const sent: ClientFrame[] = [];
  const listeners = new Map<string, NavigatorListener>();
  const attachNavigator = vi.fn();
  const detachNavigator = vi.fn();
  const channel = {
    attachNavigator: (session: string, value: NavigatorListener) => {
      attachNavigator(session, value);
      listeners.set(session, value);
    },
    detachNavigator: (session: string) => {
      detachNavigator(session);
      listeners.delete(session);
    },
    send: (frame: ClientFrame) => { sent.push(frame); },
  } as unknown as RemoteChannel;
  const requests = (): RequestFrame[] => sent.filter((frame): frame is RequestFrame => frame.type === 'filesystem-request');
  const replyTo = (request: RequestFrame, result: unknown, error?: string) => {
    listeners.get(request.session)?.onReply({
      type: 'filesystem-reply', session: request.session, request: request.request,
      ...(error ? { error } : { result }),
    });
  };
  const reply = (result: unknown, error?: string) => {
    const request = requests().at(-1);
    if (!request) throw new Error('No request was sent.');
    replyTo(request, result, error);
  };
  return {
    channel, attachNavigator, detachNavigator, sent, requests, reply, replyTo,
    listener: () => [...listeners.values()].at(-1),
  };
}

function loopback(root: string) {
  const listeners = new Map<string, NavigatorListener>();
  const sent: ClientFrame[] = [];
  const navigators = new RemoteFileNavigators((frame) => {
    if (frame.type !== 'filesystem-reply') return;
    listeners.get(frame.session)?.onReply(frame);
  }, root);
  const channel = {
    attachNavigator: (session: string, listener: NavigatorListener) => { listeners.set(session, listener); },
    detachNavigator: (session: string) => { listeners.delete(session); },
    send: (frame: ClientFrame) => {
      sent.push(frame);
      if (frame.type === 'filesystem-open') navigators.open(frame.session);
      else if (frame.type === 'filesystem-request') navigators.request(frame);
    },
  } as unknown as RemoteChannel;
  return {
    channel, navigators, sent,
    requests: () => sent.filter((frame): frame is RequestFrame => frame.type === 'filesystem-request'),
    dispose: () => { navigators.dispose(); },
  };
}

function regexMessage(pattern: string): string {
  try {
    new RegExp(pattern, 'i');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected ${pattern} to be an invalid regular expression`);
}

const LITERAL_HINT = 'Use --literal to search for the text as typed.';
const EMPTY_MATCH = 'Pattern matches empty text, so it would match every line: x*.';

describe('grepFilesInTab', () => {
  let launch: string;
  let workspace: string;
  let outside: string;
  let homeDir: string;
  let tabs: FakeTab[];
  let lookups: string[];
  let remote: ReturnType<typeof fakeChannel>;
  let hasManager: boolean;
  let hasChannel: boolean;
  let hasReady: boolean;
  let hasWorkspace: boolean;

  const managers = () => ({
    tab: {
      launchDir: launch,
      byLabel: (label: string) => {
        lookups.push(label);
        return tabs.find((tab) => tab.label === label);
      },
    },
    remote: hasManager ? {
      get: () => hasChannel ? remote.channel : undefined,
      readyOf: () => hasReady ? Promise.resolve('/remote/ws') : undefined,
      workspaceOf: () => hasWorkspace ? '/remote/ws' : undefined,
    } : undefined,
  }) as never;

  beforeEach(() => {
    launch = mkdtempSync(path.join(tmpdir(), 'tab-grep-launch-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'tab-grep-workspace-'));
    outside = mkdtempSync(path.join(tmpdir(), 'tab-grep-outside-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'tab-grep-home-'));
    home.dir = homeDir;
    writeFileSync(path.join(launch, 'launch.md'), 'launch needle\n');
    writeFileSync(path.join(workspace, 'workspace.md'), 'workspace needle\n');
    writeFileSync(path.join(outside, 'outside.md'), 'outside needle\n');
    tabs = [];
    lookups = [];
    remote = fakeChannel();
    hasManager = true;
    hasChannel = true;
    hasReady = true;
    hasWorkspace = true;
    vi.mocked(grepWorkspace).mockReset();
    vi.mocked(grepWorkspace).mockImplementation(grepControl.actual!);
    vi.mocked(readFile).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of [launch, workspace, outside, homeDir]) rmSync(dir, { recursive: true, force: true });
  });

  it('greps the workspace of a local tab that has one', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    expect(await grepFilesInTab(managers(), 'janus', 'file grep needle')).toBe('workspace.md:1: workspace needle');
  });

  it('greps the launch directory for a local tab without a workspace', async () => {
    tabs = [{ label: 'janus' }];
    expect(await grepFilesInTab(managers(), 'janus', 'file grep needle')).toBe('launch.md:1: launch needle');
  });

  it('greps the launch directory for a label with no tab', async () => {
    expect(await grepFilesInTab(managers(), 'missing', 'file grep needle')).toBe('launch.md:1: launch needle');
    expect(lookups).toContain('missing');
  });

  it('prints the usage line without looking up the tab or touching files', async () => {
    expect(await grepFilesInTab(managers(), 'janus', 'file grep')).toBe(FILE_GREP_USAGE);
    expect(await grepFilesInTab(managers(), 'janus', 'file grep --unknown x')).toBe(FILE_GREP_USAGE);
    expect(lookups).toEqual([]);
    expect(grepWorkspace).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('passes the complete parsed arguments and one fresh deadline to the local workspace grep', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    vi.mocked(grepWorkspace).mockResolvedValue('delegated');
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    expect(await grepFilesInTab(managers(), 'janus', 'file grep --literal request   timed out --word')).toBe('delegated');
    const expected: FileGrepArgs = {
      pattern: 'request   timed out --word',
      include: '',
      exclude: '',
      literal: true,
      word: false,
      caseSensitive: false,
      limit: 100,
      path: undefined,
    };
    expect(vi.mocked(grepWorkspace).mock.calls).toEqual([[workspace, expected, 1000 + GREP_TIMEOUT_MS]]);
  });

  it('lets an unexpected local workspace rejection propagate by identity', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    const failure = new Error('matcher exploded');
    vi.mocked(grepWorkspace).mockRejectedValue(failure);
    await expect(grepFilesInTab(managers(), 'janus', 'file grep needle')).rejects.toBe(failure);
  });

  describe('on a remote tab', () => {
    beforeEach(() => {
      tabs = [{ label: 'far', workspaceDir: workspace, remote: { host: 'box' } }];
    });

    const start = (line: string) => grepFilesInTab(managers(), 'far', line);
    const replyText = async (line: string, result: unknown, error?: string) => {
      const pending = start(line);
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.reply(result, error);
      return pending;
    };

    it('prints the unavailable line with no remote manager', async () => {
      hasManager = false;
      expect(await start('file grep needle')).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
      expect(grepWorkspace).not.toHaveBeenCalled();
    });

    it('prints the unavailable line with no channel', async () => {
      hasChannel = false;
      expect(await start('file grep needle')).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
    });

    it('prints the unavailable line with no readiness', async () => {
      hasReady = false;
      expect(await start('file grep needle')).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
    });

    it('prints the unavailable line with no workspace', async () => {
      hasWorkspace = false;
      expect(await start('file grep needle')).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
    });

    it('returns only the remote rows even when the local workspace matches too', async () => {
      expect(await replyText('file grep needle', { text: 'remote/a.ts:2: remote needle' }))
        .toBe('remote/a.ts:2: remote needle');
      expect(grepWorkspace).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
      const [request] = remote.requests();
      expect(request).toMatchObject({
        operation: 'grep-files',
        args: {
          pattern: 'needle', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
        },
      });
      expect(request?.session.startsWith('file-grep-')).toBe(true);
      expect(request?.session).not.toBe('janus');
    });

    it('rewrites an exact missing-path line to ./missing/', async () => {
      expect(await replyText('file grep --path ./missing/ x', { text: 'Path not found: missing.' }))
        .toBe('Path not found: ./missing/.');
      expect(remote.requests()[0]).toMatchObject({ args: { path: 'missing' } });
    });

    it('maps a containment refusal to the path as typed', async () => {
      expect(await replyText('file grep --path ./notes/ x', undefined, OUTSIDE_ROOT_REASON))
        .toBe('Outside the workspace: ./notes/.');
    });

    it('leaves a row whose preview ends like the sent path unchanged', async () => {
      expect(await replyText('file grep --path ./a.md x', { text: 'a.md:1: see: a.md.' }))
        .toBe('a.md:1: see: a.md.');
    });

    it('leaves multi-line text with a diagnostic-looking first line unchanged', async () => {
      const text = 'Path not found: missing.\na.md:1: x';
      expect(await replyText('file grep --path ./missing/ x', { text })).toBe(text);
    });

    it('uses a distinct file-grep session for each concurrent invocation', async () => {
      const first = start('file grep first');
      const second = start('file grep second');
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(2));
      const requests = remote.requests();
      expect(new Set(requests.map((request) => request.session)).size).toBe(2);
      for (const request of requests) {
        expect(request.session.startsWith('file-grep-')).toBe(true);
        expect(request.session).not.toBe('janus');
      }
      const [firstRequest, secondRequest] = requests;
      remote.replyTo(firstRequest, { text: 'a.ts:1: first' });
      remote.replyTo(secondRequest, { text: 'b.ts:1: second' });
      await expect(first).resolves.toBe('a.ts:1: first');
      await expect(second).resolves.toBe('b.ts:1: second');
      expect(grepWorkspace).not.toHaveBeenCalled();
    });

    it('prints an unavailable error reply as is', async () => {
      expect(await replyText('file grep x', undefined, 'Remote connection unavailable.'))
        .toBe('Remote connection unavailable.');
    });

    it('prints the ended line when the channel closes mid-grep', async () => {
      const pending = start('file grep x');
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.listener()?.onClose?.();
      await expect(pending).resolves.toBe('The remote connection ended.');
    });

    it('prints the timeout line after the ordinary request deadline', async () => {
      vi.useFakeTimers();
      try {
        const pending = start('file grep x');
        await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
        await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
        await expect(pending).resolves.toBe('The remote machine did not answer in time.');
      } finally {
        vi.useRealTimers();
      }
    });

    it('prints a generic far-side error', async () => {
      expect(await replyText('file grep x', undefined, 'boom')).toBe('boom');
    });

    it('prints the decoder text for a malformed successful reply', async () => {
      expect(await replyText('file grep x', { text: 7 })).toBe('Invalid remote filesystem operation result.');
    });

    it('disposes the session once after a successful reply', async () => {
      await replyText('file grep x', { text: '(no matches)' });
      expect(remote.detachNavigator).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(remote.sent.filter((frame) => frame.type === 'filesystem-close')).toHaveLength(1));
      expect(grepWorkspace).not.toHaveBeenCalled();
    });

    it('disposes the session once after a rejected reply', async () => {
      await replyText('file grep x', undefined, 'boom');
      expect(remote.detachNavigator).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(remote.sent.filter((frame) => frame.type === 'filesystem-close')).toHaveLength(1));
      expect(grepWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('mixed regex, secret and containment precedence', () => {
    let loop: ReturnType<typeof loopback>;

    const localManagers = () => ({
      tab: {
        launchDir: workspace,
        byLabel: () => ({ label: 'janus', workspaceDir: workspace }),
      },
    }) as never;

    const remoteManagers = () => ({
      tab: {
        launchDir: workspace,
        byLabel: () => ({ label: 'far', remote: { host: 'box' } }),
      },
      remote: {
        get: () => loop.channel,
        readyOf: () => Promise.resolve(workspace),
        workspaceOf: () => workspace,
      },
    }) as never;

    beforeEach(() => {
      writeFileSync(path.join(workspace, '.env'), 'hidden needle\n');
      writeFileSync(path.join(outside, '.env'), 'outside needle\n');
      symlinkSync(outside, path.join(workspace, 'outside-link'), 'dir');
      symlinkSync(outside, path.join(workspace, '.ssh'), 'dir');
      loop = loopback(workspace);
    });

    afterEach(() => {
      loop.dispose();
    });

    it('reports a local malformed regex before a contained secret', async () => {
      expect(await grepFilesInTab(localManagers(), 'janus', 'file grep [unclosed'))
        .toBe(`${regexMessage('[unclosed')}\n${LITERAL_HINT}`);
      expect(readFile).not.toHaveBeenCalled();
    });

    it('reports a local empty-matching regex before a missing path', async () => {
      expect(await grepFilesInTab(localManagers(), 'janus', 'file grep --path missing x*')).toBe(EMPTY_MATCH);
      expect(readFile).not.toHaveBeenCalled();
    });

    it('reports a local malformed regex before an absolute path', async () => {
      expect(await grepFilesInTab(localManagers(), 'janus', 'file grep --path /etc [unclosed'))
        .toBe(`${regexMessage('[unclosed')}\n${LITERAL_HINT}`);
      expect(readFile).not.toHaveBeenCalled();
    });

    it('reports a remote malformed regex before a contained secret', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep [unclosed'))
        .toBe(`${regexMessage('[unclosed')}\n${LITERAL_HINT}`);
      expect(grepWorkspace).toHaveBeenCalledOnce();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('reports a remote empty-matching regex before a missing path', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep --path missing x*')).toBe(EMPTY_MATCH);
      expect(grepWorkspace).toHaveBeenCalledOnce();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('refuses a remote absolute path without a request or regex check', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep --path /etc [unclosed'))
        .toBe('Outside the workspace: /etc.');
      expect(loop.requests()).toEqual([]);
      expect(grepWorkspace).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('refuses a remote outside-resolving ordinary link before the workspace run', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep --path outside-link [unclosed'))
        .toBe('Outside the workspace: outside-link.');
      expect(grepWorkspace).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('refuses a remote outside-resolving secret spelling before workspace regex validation', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep --path .ssh x*'))
        .toBe('Outside the workspace: .ssh.');
      expect(grepWorkspace).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('searches a valid local contained secret without reading it', async () => {
      expect(await grepFilesInTab(localManagers(), 'janus', 'file grep --path .env needle')).toBe('(no matches)');
      expect(readFile).not.toHaveBeenCalled();
    });

    it('searches a valid remote contained secret without reading it', async () => {
      expect(await grepFilesInTab(remoteManagers(), 'far', 'file grep --path .env needle')).toBe('(no matches)');
      expect(grepWorkspace).toHaveBeenCalledOnce();
      expect(readFile).not.toHaveBeenCalled();
    });
  });
});
