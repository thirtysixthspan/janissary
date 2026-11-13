import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame } from '../remote/protocol-frames.js';
import { LONG_REQUEST_DEADLINE_MS } from '../file-navigator/remote/port-requests.js';
import { mutateFileInTab } from './tab-write.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

function fakeChannel() {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const channel = {
    attachNavigator: vi.fn((_id: string, value: NavigatorListener) => { listener = value; }),
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
  return { channel, requests, reply, close: () => listener?.onClose?.() };
}

describe('mutateFileInTab', () => {
  let root: string;
  let workspace: string;
  let tabs: FakeTab[];
  let remote: ReturnType<typeof fakeChannel>;
  let hasChannel: boolean;

  const managers = () => ({
    tab: { launchDir: root, byLabel: (label: string) => tabs.find((tab) => tab.label === label) },
    remote: {
      get: () => (hasChannel ? remote.channel : undefined),
      readyOf: () => Promise.resolve('/remote/ws'),
      workspaceOf: () => '/remote/ws',
    },
  }) as unknown as Managers;

  const run = (line: string) => mutateFileInTab(managers(), 'janus', line);

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'tab-write-root-'));
    workspace = mkdtempSync(path.join(tmpdir(), 'tab-write-workspace-'));
    tabs = [];
    remote = fakeChannel();
    hasChannel = true;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('writes under the workspace clone of a local tab', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    expect(await run('file write {"path":"a.txt","content":"hi"}')).toBe('Wrote a.txt.');
    expect(readFileSync(path.join(workspace, 'a.txt'), 'utf8')).toBe('hi');
    expect(existsSync(path.join(root, 'a.txt'))).toBe(false);
  });

  it('writes under the launch directory and creates parent folders', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run(String.raw`file write {"path":"x/y/a b.txt","content":"a\nb\n"}`)).toBe('Wrote x/y/a b.txt.');
    expect(readFileSync(path.join(root, 'x', 'y', 'a b.txt'), 'utf8')).toBe('a\nb\n');
  });

  it('prints the replacement count of an edit', async () => {
    writeFileSync(path.join(root, 'a.txt'), 'one one');
    expect(await run('file edit {"path":"a.txt","oldString":"one","newString":"two","replaceAll":true}'))
      .toBe('Edited a.txt (2 replacements).');
    expect(readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('two two');
  });

  it('escapes a newline in the path', async () => {
    expect(await run(String.raw`file write {"path":"a\nb.txt","content":""}`)).toBe(String.raw`Wrote a\nb.txt.`);
  });

  it('prints usage and creates nothing for malformed JSON', async () => {
    expect(await run('file write {"path":"a.txt",')).toBe('Usage: file write <JSON>');
    expect(readdirSync(root)).toEqual([]);
  });

  describe('on a remote tab', () => {
    beforeEach(() => {
      tabs = [{ label: 'janus', remote: { host: 'box' } }];
    });

    const withReply = async (line: string, result: unknown, error?: string) => {
      const pending = run(line);
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.reply(result, error);
      return pending;
    };

    it('prints the unavailable line without touching a same-named local file', async () => {
      hasChannel = false;
      writeFileSync(path.join(root, 'a.txt'), 'local');
      expect(await run('file write {"path":"a.txt","content":"x"}')).toBe('Remote connection unavailable.');
      expect(readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('local');
    });

    it('sends write-file with the tool-text policy and disposes the port', async () => {
      expect(await withReply('file write {"path":"a.txt","content":"x"}', { ok: true })).toBe('Wrote a.txt.');
      expect(remote.requests()[0]).toMatchObject({ operation: 'write-file', args: { path: 'a.txt', policy: 'tool-text' } });
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
    });

    it('sends edit-file and disposes the port after a failure result', async () => {
      expect(await withReply('file edit {"path":"a.txt","oldString":"a","newString":"b"}', { ok: false, reason: 'No matching text' }))
        .toBe('No matching text: a.txt.');
      expect(remote.requests()[0]).toMatchObject({ operation: 'edit-file' });
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
    });

    it('prints the ended line when the connection closes mid-write', async () => {
      const pending = run('file write {"path":"a.txt","content":"x"}');
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.close();
      expect(await pending).toBe('The remote connection ended.');
    });
    it('prints the invalid-result line for a zero-replacement reply', async () => {
      expect(await withReply('file edit {"path":"a.txt","oldString":"a","newString":"b"}', { ok: true, value: { replacements: 0 } }))
        .toBe('Invalid remote filesystem operation result.: a.txt.');
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
    });

    it('reports a timed-out edit once and does not resend it', async () => {
      vi.useFakeTimers();
      try {
        const pending = run('file edit {"path":"a.txt","oldString":"a","newString":"b"}');
        await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
        await vi.advanceTimersByTimeAsync(LONG_REQUEST_DEADLINE_MS + 1);
        expect(await pending).toContain('The remote machine did not answer in time.');
        remote.reply({ ok: true, value: { replacements: 1 } });
        expect(remote.requests()).toHaveLength(1);
        expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
