import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { FILE_READ_USAGE } from '../file-read/command.js';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame } from '../remote/protocol-frames.js';
import { command } from './file.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

function fakeChannel() {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const attachNavigator = vi.fn((_id: string, value: NavigatorListener) => { listener = value; });
  const channel = {
    attachNavigator,
    detachNavigator: vi.fn(),
    send: (frame: ClientFrame) => { sent.push(frame); },
  };
  const requests = () => sent.filter((frame) => frame.type === 'filesystem-request');
  const reply = (result: unknown, error?: string) => {
    const request = requests().at(-1);
    if (request?.type !== 'filesystem-request') throw new Error('No request was sent.');
    listener?.onReply({
      type: 'filesystem-reply', session: request.session, request: request.request,
      ...(error ? { error } : { result }),
    });
  };
  return { channel, attachNavigator, requests, reply, listener: () => listener };
}

describe('file command match', () => {
  it('accepts file and any letter case, and rejects files', () => {
    expect(command.match('file')).toBe(true);
    expect(command.match('FILE read x')).toBe(true);
    expect(command.match('files x')).toBe(false);
  });
});

describe('file command run', () => {
  let root: string;
  let workspace: string;
  let appended: { input: string; output: string }[];
  let lookups: string[];
  let remoteCalls: string[];
  let tabs: FakeTab[];
  let remote: ReturnType<typeof fakeChannel>;
  let hasChannel: boolean;
  let workspaceKnown: boolean;

  const managers = () => ({
    tab: {
      launchDir: root,
      byLabel: (label: string) => {
        lookups.push(label);
        return tabs.find((tab) => tab.label === label);
      },
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
    },
    remote: {
      get: (label: string) => {
        remoteCalls.push(`get:${label}`);
        return hasChannel ? remote.channel : undefined;
      },
      readyOf: (label: string) => {
        remoteCalls.push(`readyOf:${label}`);
        return Promise.resolve('/remote/ws');
      },
      workspaceOf: (label: string) => {
        remoteCalls.push(`workspaceOf:${label}`);
        return workspaceKnown ? '/remote/ws' : undefined;
      },
    },
  });

  const run = async (line: string, label = 'janus') => {
    await command.run(line, { label, index: 0 }, managers() as never);
    expect(appended).toHaveLength(1);
    expect(appended[0].input).toBe(line);
    return appended[0].output;
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'file-command-root-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'file-command-workspace-'));
    appended = [];
    lookups = [];
    remoteCalls = [];
    tabs = [];
    remote = fakeChannel();
    hasChannel = true;
    workspaceKnown = true;
    writeFileSync(path.join(root, 'notes.md'), 'project one\nproject two\n');
    writeFileSync(path.join(workspace, 'notes.md'), 'workspace one\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('reads under the workspace of a local tab that has one', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    expect(await run('file read notes.md')).toBe('1\tworkspace one');
  });

  it('reads under the project directory for a local tab without a workspace', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run('file read notes.md')).toBe('1\tproject one\n2\tproject two');
  });

  it('reads under the project directory for a label with no tab', async () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'a.ts'), 'a\nb\nc\n');
    expect(await run('file read src/a.ts --offset 2 --limit 1', 'missing')).toBe('2\tb\n(showing lines 2-2 of 3; continue with --offset 3)');
  });

  it('prints the usage line without looking up the tab', async () => {
    tabs = [{ label: 'janus', remote: { host: 'box' } }];
    expect(await run('file read')).toBe(FILE_READ_USAGE);
    expect(lookups).toEqual([]);
    expect(remote.attachNavigator).not.toHaveBeenCalled();
    expect(remoteCalls).toEqual([]);
  });

  describe('on a remote tab', () => {
    beforeEach(() => {
      tabs = [{ label: 'janus', remote: { host: 'box' } }];
    });

    const start = (line: string) => command.run(line, { label: 'janus', index: 0 }, managers() as never);

    const output = () => {
      expect(appended).toHaveLength(1);
      return appended[0].output;
    };

    const readWithReply = async (line: string, result: unknown, error?: string) => {
      const pending = start(line);
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.reply(result, error);
      await pending;
      return output();
    };

    it('sends read-lines on its own session and prints the reply untagged', async () => {
      expect(await readWithReply('file read ./notes/a.md', { text: '1\tremote one' })).toBe('1\tremote one');
      const [request] = remote.requests();
      expect(request).toMatchObject({
        type: 'filesystem-request', operation: 'read-lines', args: { path: 'notes/a.md', offset: 1, limit: 2000 },
      });
      if (request.type !== 'filesystem-request') throw new Error('Expected a filesystem request.');
      expect(request.session.startsWith('file-read-')).toBe(true);
      expect(request.session).not.toBe('janus');
      expect(output()).not.toContain('project one');
    });

    it('forwards the typed offset and limit', async () => {
      await readWithReply('file read notes.md --offset 5 --limit 3', { text: '5\tfive' });
      expect(remote.requests()[0]).toMatchObject({ args: { path: 'notes.md', offset: 5, limit: 3 } });
    });

    it('prints the unavailable line with no channel and constructs no port', async () => {
      hasChannel = false;
      await start('file read notes.md');
      expect(output()).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
    });

    it('prints the unavailable line while the workspace is still being prepared', async () => {
      workspaceKnown = false;
      await start('file read notes.md');
      expect(output()).toBe('Remote connection unavailable.');
      expect(remote.attachNavigator).not.toHaveBeenCalled();
    });

    it('prints an unavailable error reply as is', async () => {
      expect(await readWithReply('file read notes.md', undefined, 'Remote connection unavailable.'))
        .toBe('Remote connection unavailable.');
    });

    it('maps the far-side containment refusal to the path as typed', async () => {
      expect(await readWithReply('file read ../x', undefined, OUTSIDE_ROOT_REASON)).toBe('Outside the workspace: ../x.');
    });

    it('answers an absolute path without sending a request', async () => {
      await start('file read /etc/passwd');
      expect(output()).toBe('Outside the workspace: /etc/passwd.');
      expect(remote.requests()).toEqual([]);
    });

    it('prints the ended line when the channel closes mid-read', async () => {
      const pending = start('file read notes.md');
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.listener()?.onClose?.();
      await pending;
      expect(output()).toBe('The remote connection ended.');
    });

    it('rewrites a reader error line to the path as typed', async () => {
      expect(await readWithReply('file read ./a.md', { text: 'File not found: a.md.' })).toBe('File not found: ./a.md.');
    });

    it('rewrites the root directory line to the typed dot', async () => {
      expect(await readWithReply('file read .', { text: 'Is a directory: .' })).toBe('Is a directory: ..');
    });

    it('leaves a numbered line unchanged even when it ends like an error', async () => {
      expect(await readWithReply('file read ./a.md', { text: '1\tsee: a.md.' })).toBe('1\tsee: a.md.');
    });

    it('detaches its session after a successful and a rejected read', async () => {
      await readWithReply('file read notes.md', { text: '1\tone' });
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
      appended = [];
      remote = fakeChannel();
      await readWithReply('file read notes.md', undefined, 'boom');
      expect(output()).toBe('boom');
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
    });
  });
});
