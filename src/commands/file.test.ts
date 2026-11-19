import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { FILE_GREP_USAGE, parseFileGrep } from '../file-grep/command.js';
import { FILE_PATCH_USAGE, parseFilePatchCommand } from '../file-patch/command.js';
import { FILE_READ_USAGE } from '../file-read/command.js';
import { decodeFileGrepArgs } from '../remote/filesystem/grep-files-arguments.js';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame, RemoteFrame, ServerFrame } from '../remote/protocol-frames.js';
import { decodeFrame, encodeFrame } from '../remote/protocol.js';
import { RemoteFileNavigators } from '../remote/serve-file-navigator.js';
import { fakeChannel, type RequestFrame } from '../testing/fake-remote-channel.js';
import { command } from './file.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

function wireChannel(root: string) {
  const entries: { line: string; frame: RemoteFrame }[] = [];
  let listener: NavigatorListener | undefined;
  const attachNavigator = vi.fn((_id: string, value: NavigatorListener) => { listener = value; });
  const detachNavigator = vi.fn();
  const roundTrip = (frame: ClientFrame | ServerFrame) => {
    const line = encodeFrame(frame);
    const decoded = decodeFrame(line);
    if ('error' in decoded) throw new Error(decoded.error);
    entries.push({ line, frame: decoded });
    return decoded;
  };
  const navigator = new RemoteFileNavigators((frame) => {
    const decoded = roundTrip(frame);
    if (decoded.type === 'filesystem-reply') listener?.onReply(decoded);
    else if (decoded.type === 'filesystem-event') listener?.onEvent(decoded.path);
  }, root);
  const channel = {
    attachNavigator,
    detachNavigator,
    send: (frame: ClientFrame) => {
      const decoded = roundTrip(frame);
      if (decoded.type === 'filesystem-open') { navigator.open(decoded.session); return; }
      if (decoded.type === 'filesystem-close') { navigator.close(decoded.session); return; }
      if (decoded.type === 'filesystem-request') navigator.request(decoded);
    },
  };
  const frames = () => entries.map((entry) => entry.frame);
  const requests = () => entries.filter((entry): entry is { line: string; frame: RequestFrame } => (
    entry.frame.type === 'filesystem-request'
  ));
  const closes = () => entries.filter((entry) => entry.frame.type === 'filesystem-close');
  return {
    channel, attachNavigator, detachNavigator, entries, frames, navigator, requests, closes,
    reply: () => { throw new Error('The wired transport answers through the navigator.'); },
    listener: () => listener,
  };
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
  let invocationAppends: { label: string; entry: { input: string; output: string }; invocationId: string }[];
  let lookups: string[];
  let remoteCalls: string[];
  let tabs: FakeTab[];
  let remote: ReturnType<typeof fakeChannel>;
  let remoteWorkspace: string;
  let wired: ReturnType<typeof wireChannel>;
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
      appendForInvocation: (
        label: string, entry: { input: string; output: string }, invocationId: string,
      ) => { invocationAppends.push({ label, entry, invocationId }); },
    },
    remote: {
      get: (label: string) => {
        remoteCalls.push(`get:${label}`);
        return hasChannel ? remote.channel : undefined;
      },
      readyOf: (label: string) => {
        remoteCalls.push(`readyOf:${label}`);
        return Promise.resolve(remoteWorkspace);
      },
      workspaceOf: (label: string) => {
        remoteCalls.push(`workspaceOf:${label}`);
        return workspaceKnown ? remoteWorkspace : undefined;
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
    invocationAppends = [];
    lookups = [];
    remoteCalls = [];
    tabs = [];
    remote = fakeChannel();
    remoteWorkspace = '/remote/ws';
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

  it('writes and edits a file with one output line each', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run(String.raw`file write {"path":"new/a.txt","content":"a\nb\n"}`)).toBe('Wrote new/a.txt.');
    appended = [];
    expect(await run('file edit {"path":"new/a.txt","oldString":"b","newString":"c"}')).toBe('Edited new/a.txt (1 replacements).');
    expect(readFileSync(path.join(root, 'new', 'a.txt'), 'utf8')).toBe('a\nc\n');
  });

  it('applies a patch under the project directory', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run(String.raw`file patch {"patchText":"*** Add File: a.md\n+x"}`)).toBe('Patched 1 file:\nA a.md');
    expect(readFileSync(path.join(root, 'a.md'), 'utf8')).toBe('x\n');
  });

  it('creates nothing for a malformed patch argument', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run('file patch {"patchText":1}')).toBe(FILE_PATCH_USAGE);
    expect(existsSync(path.join(root, 'a.md'))).toBe(false);
  });

  it('keeps the read usage line for file patch lookalikes', async () => {
    expect(await run('file patching x')).toBe(FILE_READ_USAGE);
  });

  it('declares a patch sample that parses as intended', () => {
    const sample = command.samples.find((value) => value.startsWith('file patch'));
    if (!sample) throw new Error('file patch sample is missing');
    expect(sample).toBe('file patch {"patchText":"*** Delete File: old.txt"}');
    expect(parseFilePatchCommand(sample)).toEqual({ patchText: '*** Delete File: old.txt' });
  });

  it('creates nothing for malformed JSON or unknown fields', async () => {
    tabs = [{ label: 'janus' }];
    expect(await run('file write {"path":"dir/a.txt"')).toBe('Usage: file write <JSON>');
    appended = [];
    expect(await run('file edit {"path":"dir/a.txt","oldString":"a","newString":"b","extra":1}')).toBe('Usage: file edit <JSON>');
    expect(existsSync(path.join(root, 'dir'))).toBe(false);
  });

  it('keeps the read usage line for bare file and file globs', async () => {
    expect(await run('file')).toBe(FILE_READ_USAGE);
    appended = [];
    expect(await run('file globs x')).toBe(FILE_READ_USAGE);
  });

  it('globs under the workspace of a local tab that has one, untagged', async () => {
    tabs = [{ label: 'janus', workspaceDir: workspace }];
    writeFileSync(path.join(root, 'project-only.md'), 'project only\n');
    expect(await run('file glob *.md')).toBe('notes.md');
  });

  it('globs under the project directory for a local tab without a workspace', async () => {
    tabs = [{ label: 'janus' }];
    writeFileSync(path.join(root, 'project-only.md'), 'project only\n');
    expect(await run('file glob *.md')).toBe('notes.md\nproject-only.md');
  });

  describe('file glob end to end', () => {
    beforeEach(() => {
      for (const dir of ['file-read', 'alpha', 'beta', 'delta', 'epsilon', 'gamma']) {
        mkdirSync(path.join(root, 'src', dir), { recursive: true });
      }
      for (const file of ['command.test.ts', 'policy.test.ts', 'command.ts']) {
        writeFileSync(path.join(root, 'src', 'file-read', file), '');
      }
      writeFileSync(path.join(root, '.env.example'), 'A=1\n');
      writeFileSync(path.join(root, '.env.local'), 'A=2\n');
    });

    it('lists the sorted test paths under a --path directory', async () => {
      expect(await run('file glob **/*.test.ts --path src/file-read'))
        .toBe('src/file-read/command.test.ts\nsrc/file-read/policy.test.ts');
    });

    it('lists the first five directories with the truncation line', async () => {
      expect(await run('file glob * --dirs --path src --limit 5')).toBe([
        'src/alpha/', 'src/beta/', 'src/delta/', 'src/epsilon/', 'src/file-read/',
        '(showing the first 5 matches; narrow the pattern or raise --limit)',
      ].join('\n'));
    });

    it('prints no matches for a pattern that matches nothing', async () => {
      expect(await run('file glob nothing-matches-this')).toBe('(no matches)');
    });

    it('prints a missing --path directory', async () => {
      expect(await run('file glob *.ts --path missing')).toBe('Directory not found: missing.');
    });

    it('never lists .env files, even with --hidden', async () => {
      expect(await run('file glob .env.* --hidden')).toBe('(no matches)');
    });

    it('omits .env files from a --hidden listing of every name', async () => {
      const output = await run('file glob * --hidden');
      expect(output).not.toContain('.env.example');
      expect(output).not.toContain('.env.local');
    });
  });

  describe('file grep end to end', () => {
    it('greps under the workspace of a local tab that has one', async () => {
      tabs = [{ label: 'janus', workspaceDir: workspace }];
      writeFileSync(path.join(workspace, 'notes.md'), 'workspace needle\n');
      writeFileSync(path.join(root, 'notes.md'), 'project needle\n');
      expect(await run('file grep needle')).toBe('notes.md:1: workspace needle');
    });

    it('prints the grep usage line for a malformed grep', async () => {
      tabs = [{ label: 'janus' }];
      expect(await run('file grep')).toBe(FILE_GREP_USAGE);
      appended = [];
      expect(await run('file grep --limit 0 x')).toBe(FILE_GREP_USAGE);
    });

    it('keeps the read usage line for file greps', async () => {
      expect(await run('file greps x')).toBe(FILE_READ_USAGE);
    });

    it('declares grep samples that parse as intended', () => {
      const samples = command.samples.filter((sample) => sample.startsWith('file grep'));
      expect(samples).toEqual(['file grep TODO', 'file grep --literal --include *.md request timed out']);
      expect(parseFileGrep(samples[0])).toEqual({
        pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
        path: undefined,
      });
      expect(parseFileGrep(samples[1])).toEqual({
        pattern: 'request timed out', include: '*.md', exclude: '', literal: true, word: false, caseSensitive: false,
        limit: 100, path: undefined,
      });
    });

    it('appends one invocation-aware entry with the exact command text and invocation id', async () => {
      tabs = [{ label: 'janus', workspaceDir: workspace }];
      writeFileSync(path.join(workspace, 'notes.md'), 'workspace needle\n');
      const invocation = {
        runId: 'run-1', invocationId: 'inv-1',
        caller: { label: 'janus', cwd: root, context: [] },
        signal: new AbortController().signal,
      };
      await command.run('file grep needle', { label: 'janus', index: 0 }, managers() as never, invocation);
      expect(appended).toEqual([]);
      expect(invocationAppends).toEqual([{
        label: 'janus',
        entry: { input: 'file grep needle', output: 'notes.md:1: workspace needle' },
        invocationId: 'inv-1',
      }]);
    });
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

    it('sends grep-files on its own session and prints the remote rows untagged', async () => {
      expect(await readWithReply('file grep needle', { text: 'remote/a.ts:2: remote needle' }))
        .toBe('remote/a.ts:2: remote needle');
      const [request] = remote.requests();
      if (request.type !== 'filesystem-request') throw new Error('Expected a filesystem request.');
      expect(request.operation).toBe('grep-files');
      expect(request.args).toEqual({
        pattern: 'needle', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
      });
      expect(request.session.startsWith('file-grep-')).toBe(true);
      expect(request.session).not.toBe('janus');
      expect(output()).not.toContain('project one');
    });

    it('sends glob-paths on its own session and prints the reply unchanged', async () => {
      expect(await readWithReply('file glob *.md', { text: 'a.md\nb.md' })).toBe('a.md\nb.md');
      const [request] = remote.requests();
      if (request.type !== 'filesystem-request') throw new Error('Expected a filesystem request.');
      expect(request.operation).toBe('glob-paths');
      expect(request.args).toEqual({ pattern: '*.md', limit: 100 });
      expect(request.session.startsWith('file-glob-')).toBe(true);
    });

    it('forwards the glob switches and limit', async () => {
      await readWithReply('file glob * --hidden --dirs --limit 5', { text: '(no matches)' });
      expect(remote.requests()[0]).toMatchObject({ args: { pattern: '*', hidden: true, dirs: true, limit: 5 } });
    });

    it('sends the root for a dot --path', async () => {
      await readWithReply('file glob *.md --path .', { text: '(no matches)' });
      expect(remote.requests()[0]).toMatchObject({ args: { pattern: '*.md', dir: '', limit: 100 } });
    });

    it('rewrites a far-side directory line to the --path as typed', async () => {
      expect(await readWithReply('file glob *.md --path ./notes/', { text: 'Directory not found: notes.' }))
        .toBe('Directory not found: ./notes/.');
      expect(remote.requests()[0]).toMatchObject({ args: { dir: 'notes' } });
    });

    it('maps the far-side containment refusal to the --path as typed', async () => {
      expect(await readWithReply('file glob * --path ../x', undefined, OUTSIDE_ROOT_REASON))
        .toBe('Outside the workspace: ../x.');
    });

    it('answers an absolute --path without sending a request', async () => {
      await start('file glob * --path /etc');
      expect(output()).toBe('Outside the workspace: /etc.');
      expect(remote.requests()).toEqual([]);
    });

    it('prints the ended line when the channel closes mid-glob', async () => {
      const pending = start('file glob *.md');
      await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
      remote.listener()?.onClose?.();
      await pending;
      expect(output()).toBe('The remote connection ended.');
    });

    it('detaches its session after a successful and a rejected glob', async () => {
      await readWithReply('file glob *.md', { text: 'a.md' });
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
      appended = [];
      remote = fakeChannel();
      await readWithReply('file glob *.md', undefined, 'boom');
      expect(output()).toBe('boom');
      expect(remote.channel.detachNavigator).toHaveBeenCalledOnce();
    });

    describe('file grep over the encoded navigator transport', () => {
      let farRoot: string;

      beforeEach(() => {
        farRoot = mkdtempSync(path.join(tmpdir(), 'file-command-far-'));
        mkdirSync(path.join(farRoot, 'src', 'keep'), { recursive: true });
        writeFileSync(path.join(farRoot, 'a.ts'), 'remote needle one\n');
        writeFileSync(path.join(farRoot, 'b.ts'), 'remote needle two\n');
        writeFileSync(path.join(farRoot, 'notes.md'), 'docs only\n');
        writeFileSync(path.join(farRoot, 'src', 'alpha.ts'), 'const REFERENCE: src.\n');
        writeFileSync(path.join(farRoot, 'src', 'keep', 'gamma.ts'), 'const REFERENCE = 2\n');
        writeFileSync(path.join(farRoot, 'src', 'beta.ts'), 'const REFERENCE = 3\n');
        writeFileSync(path.join(root, 'a.ts'), 'near needle\n');
        wired = wireChannel(farRoot);
        remote = wired;
        remoteWorkspace = farRoot;
      });

      afterEach(() => { rmSync(farRoot, { recursive: true, force: true }); });

      it('searches the far root with default fields and sends no path key', async () => {
        await start('file grep needle');

        expect(output()).toBe('a.ts:1: remote needle one\nb.ts:1: remote needle two');
        expect(output()).not.toContain('near');
        const [request] = wired.requests();
        if (request?.frame.type !== 'filesystem-request' || request.frame.operation !== 'grep-files') {
          throw new Error('Expected one grep-files request.');
        }
        expect(request.frame.args).toEqual({
          pattern: 'needle', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
        });
        expect(decodeFileGrepArgs(request.frame.args)).toEqual({
          pattern: 'needle', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
          path: undefined,
        });
        const wire = JSON.parse(request.line) as { args: Record<string, unknown> };
        expect(Object.hasOwn(wire.args, 'path')).toBe(false);
        expect(request.frame.session.startsWith('file-grep-')).toBe(true);
        expect(request.frame.session).not.toBe('janus');
        await vi.waitFor(() => expect(wired.closes()).toHaveLength(1));
        expect(wired.closes()[0]?.frame).toMatchObject({ session: request.frame.session });
        expect(wired.detachNavigator).toHaveBeenCalledWith(request.frame.session);
      });

      it('maps a nondefault --path through the codec and restores a missing typed path', async () => {
        await start('file grep --literal --word --case-sensitive --path ./src/ --include *.ts --exclude beta.ts --limit 5 REFERENCE');

        expect(output()).toBe([
          'src/alpha.ts:1: const REFERENCE: src.',
          'src/keep/gamma.ts:1: const REFERENCE = 2',
        ].join('\n'));
        expect(appended[0]?.input).toBe(
          'file grep --literal --word --case-sensitive --path ./src/ --include *.ts --exclude beta.ts --limit 5 REFERENCE',
        );
        const [first] = wired.requests();
        if (first?.frame.type !== 'filesystem-request' || first.frame.operation !== 'grep-files') {
          throw new Error('Expected one grep-files request.');
        }
        expect(first.frame.args).toEqual({
          pattern: 'REFERENCE', include: '*.ts', exclude: 'beta.ts',
          literal: true, word: true, caseSensitive: true, limit: 5, path: 'src',
        });
        const wire = JSON.parse(first.line) as { args: Record<string, unknown> };
        expect(wire.args.path).toBe('src');

        appended = [];
        await start('file grep --path ./missing/ x');

        expect(output()).toBe('Path not found: ./missing/.');
        const [, second] = wired.requests();
        if (second?.frame.type !== 'filesystem-request' || second.frame.operation !== 'grep-files') {
          throw new Error('Expected a second grep-files request.');
        }
        expect(second.frame.args).toMatchObject({ pattern: 'x', path: 'missing', limit: 100 });
        expect(second.frame.session).not.toBe(first.frame.session);
        expect(second.frame.session.startsWith('file-grep-')).toBe(true);
        await vi.waitFor(() => expect(wired.closes()).toHaveLength(2));
        expect(wired.detachNavigator).toHaveBeenCalledTimes(2);
      });
    });
  });
});
