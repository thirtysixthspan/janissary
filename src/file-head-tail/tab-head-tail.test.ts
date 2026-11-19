import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame } from '../remote/protocol-frames.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { readWorkspaceLines } from '../file-read/read.js';
import { headTailInTab } from './tab-head-tail.js';

type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;

function fakeChannel() {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const attachNavigator = vi.fn((_id: string, value: NavigatorListener) => { listener = value; });
  const channel = {
    attachNavigator,
    detachNavigator: vi.fn(),
    send: (frame: ClientFrame) => { sent.push(frame); },
  } as unknown as RemoteChannel;
  const requests = () => sent.filter((frame): frame is RequestFrame => frame.type === 'filesystem-request');
  const reply = (result: unknown, error?: string) => {
    const request = requests().at(-1);
    if (!request) throw new Error('No request was sent.');
    listener?.onReply({
      type: 'filesystem-reply', session: request.session, request: request.request,
      ...(error ? { error } : { result }),
    });
  };
  return { channel, attachNavigator, requests, reply };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-head-tail-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const managersWith = (workspaceDir?: string) => ({
  tab: {
    launchDir: root,
    byLabel: () => ({ label: 'janus', ...(workspaceDir !== undefined && { workspaceDir }) }),
  },
}) as never;

function makeFile(relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('headTailInTab', () => {
  it('prints the first N numbered lines from line 1', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 2')).toBe([
      '1\ta',
      '2\tb',
      '(showing lines 1-2 of 5; continue with --offset 3)',
    ].join('\n'));
  });

  it('prints the last N numbered lines with their absolute positions', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 2')).toBe('4\td\n5\te');
  });

  it('counts lines the same way as file read when the text ends with a newline', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne\n');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 2')).toBe('4\td\n5\te');
  });

  it('prints (empty file) in either direction for an empty file', () => {
    makeFile('a.md', '');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md')).toBe('(empty file)');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md')).toBe('(empty file)');
  });

  it('prints every line when the count exceeds the file length', () => {
    makeFile('a.md', 'a\nb');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 10')).toBe('1\ta\n2\tb');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 10')).toBe('1\ta\n2\tb');
  });

  it('prints notdir when the target is a directory', () => {
    mkdirSync(path.join(root, 'sub'));
    expect(headTailInTab(managersWith(), 'janus', 'file head sub')).toBe('notdir');
    expect(headTailInTab(managersWith(), 'janus', 'file tail sub')).toBe('notdir');
  });

  it('prints notdir when the target is a symlink to a directory', () => {
    mkdirSync(path.join(root, 'sub'));
    symlinkSync(path.join(root, 'sub'), path.join(root, 'dirlink'));
    expect(headTailInTab(managersWith(), 'janus', 'file head dirlink')).toBe('notdir');
    expect(headTailInTab(managersWith(), 'janus', 'file tail dirlink')).toBe('notdir');
  });

  it('reads a symlink to a regular file', () => {
    makeFile('a.md', 'a\nb\nc');
    symlinkSync(path.join(root, 'a.md'), path.join(root, 'filelink'));
    expect(headTailInTab(managersWith(), 'janus', 'file head filelink -n 2')).toBe([
      '1\ta',
      '2\tb',
      '(showing lines 1-2 of 3; continue with --offset 3)',
    ].join('\n'));
    expect(headTailInTab(managersWith(), 'janus', 'file tail filelink -n 2')).toBe('2\tb\n3\tc');
  });

  it('keeps file read verbose lines for absent and out-of-workspace paths', () => {
    expect(headTailInTab(managersWith(), 'janus', 'file head missing.md')).toBe('File not found: missing.md.');
    expect(headTailInTab(managersWith(), 'janus', 'file tail missing.md')).toBe('File not found: missing.md.');
    expect(headTailInTab(managersWith(), 'janus', 'file head ..')).toBe('Outside the workspace: ...');
    expect(headTailInTab(managersWith(), 'janus', 'file tail ..')).toBe('Outside the workspace: ...');
  });

  it('keeps file read verbose lines for a non-text file', () => {
    writeFileSync(path.join(root, 'a.bin'), Buffer.from([0x61, 0x00, 0x62]));
    expect(headTailInTab(managersWith(), 'janus', 'file head a.bin')).toBe('Not a text file: a.bin.');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.bin')).toBe('Not a text file: a.bin.');
  });

  it('numbers head and tail the same way as file read', () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    expect(headTailInTab(managersWith(), 'janus', 'file head a.md -n 3')).toBe(
      readWorkspaceLines(root, { path: 'a.md', offset: 1, limit: 3 }),
    );
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 3')).toBe(
      readWorkspaceLines(root, { path: 'a.md', offset: 3, limit: 3 }),
    );
  });

  it('resolves against the tab workspace or the launch directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'janus-file-head-tail-ws-'));
    try {
      writeFileSync(path.join(workspace, 'ws.md'), 'w\n');
      const withWorkspace = ({
        tab: { launchDir: root, byLabel: () => ({ label: 'janus', workspaceDir: workspace }) },
      }) as never;
      expect(headTailInTab(withWorkspace, 'janus', 'file head ws.md -n 1')).toContain('1\tw');
      expect(headTailInTab(managersWith(), 'janus', 'file head ws.md -n 1')).toBe('File not found: ws.md.');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns the usage line for malformed arguments', () => {
    expect(headTailInTab(managersWith(), 'janus', 'file head')).toBe('Usage: file head <path> [-n <lines>]');
    expect(headTailInTab(managersWith(), 'janus', 'file tail a.md -n 0')).toBe('Usage: file tail <path> [-n <lines>]');
  });
});

describe('headTailInTab on a remote tab', () => {
  const remoteRoot = '/remote/ws';
  let remote: ReturnType<typeof fakeChannel>;

  beforeEach(() => { remote = fakeChannel(); });

  const managers = (hasChannel = true) => ({
    tab: { launchDir: root, byLabel: () => ({ label: 'far', remote: { host: 'box' } }) },
    remote: {
      get: () => hasChannel ? remote.channel : undefined,
      readyOf: () => Promise.resolve(remoteRoot),
      workspaceOf: () => remoteRoot,
    },
  }) as never;

  const start = (line: string, hasChannel = true) => headTailInTab(managers(hasChannel), 'far', line);
  const replyText = async (line: string, text: string) => {
    const pending = start(line);
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    remote.reply({ text });
    return pending;
  };

  it('returns far-side head numbering verbatim with the typed count forwarded', async () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    const local = headTailInTab(managersWith(), 'janus', 'file head a.md -n 2');
    expect(await replyText('file head a.md -n 2', local)).toBe(local);
    const [request] = remote.requests();
    expect(request).toMatchObject({ operation: 'head-lines', args: { path: 'a.md', count: 2 } });
    expect(request?.session.startsWith('file-head-tail-')).toBe(true);
    expect(request?.session).not.toBe('far');
  });

  it('returns far-side tail absolute numbering verbatim', async () => {
    makeFile('a.md', 'a\nb\nc\nd\ne');
    const local = headTailInTab(managersWith(), 'janus', 'file tail a.md -n 2');
    expect(await replyText('file tail a.md -n 2', local)).toBe(local);
    expect(remote.requests()[0]).toMatchObject({ operation: 'tail-lines', args: { path: 'a.md', count: 2 } });
  });

  it('returns the far-side notdir wording in both directions', async () => {
    expect(await replyText('file head sub -n 2', 'notdir')).toBe('notdir');
    remote = fakeChannel();
    expect(await replyText('file tail sub -n 2', 'notdir')).toBe('notdir');
  });

  it('maps a relative path and never reads the local temporary directory', async () => {
    makeFile('local-only.md', 'one\ntwo');
    expect(await replyText('file head ./local-only.md -n 1', '1\tremote')).toBe('1\tremote');
    expect(remote.requests()[0]).toMatchObject({ operation: 'head-lines', args: { path: 'local-only.md', count: 1 } });
  });

  it('returns the far-side secret refusal wording', async () => {
    expect(await replyText('file head .env -n 1', 'Secret file: .env.')).toBe('Secret file: .env.');
  });

  it('answers an absolute path locally without a request', async () => {
    expect(await start('file head /etc/passwd -n 1')).toBe('Outside the workspace: /etc/passwd.');
    expect(remote.requests()).toEqual([]);
  });

  it('maps a far-side containment refusal to the path as typed', async () => {
    const pending = start('file tail ../x -n 1');
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    expect(remote.requests()[0]).toMatchObject({ args: { path: '../x', count: 1 } });
    remote.reply(undefined, OUTSIDE_ROOT_REASON);
    expect(await pending).toBe('Outside the workspace: ../x.');
  });

  it('prints the unavailable line without a channel', async () => {
    expect(await start('file head a.md -n 1', false)).toBe('Remote connection unavailable.');
    expect(remote.attachNavigator).not.toHaveBeenCalled();
  });
});
