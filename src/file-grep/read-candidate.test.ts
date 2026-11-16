import { execFileSync } from 'node:child_process';
import type { Stats } from 'node:fs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
import { homedir, tmpdir } from 'node:os';
import type * as fileSystemPromises from 'node:fs/promises';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_MAX_FILE_BYTES } from '../search/types.js';
import type { FileGrepArgs } from './command.js';
import { createCandidateReader } from './read-candidate.js';
import { scanFiles } from './scan.js';

const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fileSystemPromises>();
  return {
    ...actual,
    lstat: vi.fn(actual.lstat),
    readFile: vi.fn(actual.readFile),
    realpath: vi.fn(actual.realpath),
  };
});

let base: string;
let homeDirectory: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'file-grep-read-candidate-')));
  homeDirectory = path.join(base, 'home');
  root = path.join(base, 'workspace');
  outside = path.join(base, 'workspace-sibling');
  mkdirSync(homeDirectory);
  mkdirSync(root);
  mkdirSync(outside);
  home.dir = homeDirectory;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  rmSync(base, { recursive: true, force: true });
});

function writeAt(location: string, relative: string, content: string | Buffer = 'text\n'): string {
  const target = path.join(location, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

describe('createCandidateReader ordinary reads', () => {
  it('reads nested UTF-8 text with CRLF and whitespace unmodified', async () => {
    writeAt(root, 'nested/notes.txt', '  café\r\n\tsecond line\r\n');
    const reader = await createCandidateReader(root);
    expect(await reader('nested/notes.txt')).toBe('  café\r\n\tsecond line\r\n');
  });

  it('returns an empty string for an empty file', async () => {
    writeAt(root, 'empty.txt', '');
    const reader = await createCandidateReader(root);
    expect(await reader('empty.txt')).toBe('');
  });

  it('reads .environment and a child of a .env directory', async () => {
    writeAt(root, '.environment', 'environment\n');
    writeAt(root, '.env/config', 'config\n');
    const reader = await createCandidateReader(root);
    expect(await reader('.environment')).toBe('environment\n');
    expect(await reader('.env/config')).toBe('config\n');
  });

  it('reuses one reader for multiple relative paths', async () => {
    writeAt(root, 'one.txt', 'one');
    writeAt(root, 'nested/two.txt', 'two');
    const reader = await createCandidateReader(root);
    expect(await reader('one.txt')).toBe('one');
    expect(await reader('nested/two.txt')).toBe('two');
    expect(await reader('one.txt')).toBe('one');
  });
});

describe('createCandidateReader secret candidates', () => {
  it('skips lexical secrets before any content read', async () => {
    writeAt(root, '.env', 'SECRET=1\n');
    writeAt(root, 'nested/.env.local', 'SECRET=1\n');
    writeAt(root, '.config/gh/hosts.yml', 'oauth_token: secret\n');
    const reader = await createCandidateReader(root);
    for (const candidate of ['.env', 'nested/.env.local', '.ENV', '.config/gh/hosts.yml']) {
      expect(await reader(candidate)).toBeNull();
    }
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader structural rejections', () => {
  it('skips empty, root, absolute and escaping candidates without content reads', async () => {
    writeAt(root, 'a.txt', 'inside');
    writeAt(outside, 'outside.txt', 'outside');
    const reader = await createCandidateReader(root);
    expect(await reader('')).toBeNull();
    expect(await reader('.')).toBeNull();
    expect(await reader(path.join(root, 'a.txt'))).toBeNull();
    expect(await reader(`../${path.basename(outside)}/outside.txt`)).toBeNull();
    expect(await reader(`a/../../${path.basename(outside)}/outside.txt`)).toBeNull();
    expect(await reader('a/..')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a directory and a FIFO without opening either', async () => {
    mkdirSync(path.join(root, 'dir'));
    execFileSync('mkfifo', [path.join(root, 'pipe')]);
    const reader = await createCandidateReader(root);
    expect(await reader('dir')).toBeNull();
    expect(await reader('pipe')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader size and binary bounds', () => {
  it('accepts exactly the byte cap and skips one byte over without reading', async () => {
    writeAt(root, 'exact.txt', 'a'.repeat(SEARCH_MAX_FILE_BYTES));
    writeAt(root, 'over.txt', 'b'.repeat(SEARCH_MAX_FILE_BYTES + 1));
    const reader = await createCandidateReader(root);
    expect(await reader('exact.txt')).toBe('a'.repeat(SEARCH_MAX_FILE_BYTES));
    vi.mocked(readFile).mockClear();
    expect(await reader('over.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('tests NUL only against the first 8192 bytes', async () => {
    writeAt(root, 'nul-start.bin', Buffer.from([0, 0x61]));
    writeAt(root, 'nul-8191.txt', Buffer.concat([Buffer.alloc(8191, 0x61), Buffer.from([0, 0x62])]));
    writeAt(root, 'nul-8192.txt', Buffer.concat([Buffer.alloc(8192, 0x61), Buffer.from([0, 0x62])]));
    writeAt(root, 'nul-after-multibyte.txt', Buffer.concat([Buffer.from('é'.repeat(4096), 'utf8'), Buffer.from([0, 0x62])]));
    const reader = await createCandidateReader(root);
    expect(await reader('nul-start.bin')).toBeNull();
    expect(await reader('nul-8191.txt')).toBeNull();
    expect(await reader('nul-8192.txt')).toBe('a'.repeat(8192) + '\0b');
    expect(await reader('nul-after-multibyte.txt')).toBe('é'.repeat(4096) + '\0b');
  });
});

describe('createCandidateReader links', () => {
  it('skips a final link to a file inside the root', async () => {
    symlinkSync(writeAt(root, 'target.txt', 'target'), path.join(root, 'inside-link.txt'));
    const reader = await createCandidateReader(root);
    expect(await reader('inside-link.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a final link to a file outside the root', async () => {
    symlinkSync(writeAt(outside, 'outside.txt', 'outside'), path.join(root, 'outside-link.txt'));
    const reader = await createCandidateReader(root);
    expect(await reader('outside-link.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a dangling final link', async () => {
    symlinkSync(path.join(root, 'missing.txt'), path.join(root, 'dangling.txt'));
    const reader = await createCandidateReader(root);
    expect(await reader('dangling.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips an ancestor link pointing inside the root', async () => {
    writeAt(root, 'real-dir/notes.txt', 'notes');
    symlinkSync(path.join(root, 'real-dir'), path.join(root, 'link-dir'));
    const reader = await createCandidateReader(root);
    expect(await reader('link-dir/notes.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips an ancestor link pointing outside the root', async () => {
    writeAt(outside, 'notes.txt', 'outside notes');
    symlinkSync(outside, path.join(root, 'link-out'));
    const reader = await createCandidateReader(root);
    expect(await reader('link-out/notes.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips an ancestor link pointing to its containing directory', async () => {
    writeAt(root, 'nested/notes.txt', 'notes');
    symlinkSync(path.join(root, 'nested'), path.join(root, 'nested', 'self'));
    const reader = await createCandidateReader(root);
    expect(await reader('nested/self/notes.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('skips a stale tracked path after its directory becomes a link', async () => {
    writeAt(root, 'stale/notes.txt', 'original');
    const reader = await createCandidateReader(root);
    expect(await reader('stale/notes.txt')).toBe('original');
    rmSync(path.join(root, 'stale'), { recursive: true });
    writeAt(root, 'replacement/notes.txt', 'replacement');
    symlinkSync(path.join(root, 'replacement'), path.join(root, 'stale'));
    vi.mocked(readFile).mockClear();
    expect(await reader('stale/notes.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader canonical root and candidate', () => {
  it('reads through a safe alias of the canonical root', async () => {
    writeAt(root, 'notes.txt', 'alias text');
    const alias = path.join(base, 'alias');
    symlinkSync(root, alias);
    const reader = await createCandidateReader(alias);
    expect(await reader('notes.txt')).toBe('alias text');
  });

  it('skips when candidate canonicalization differs from the expected path', async () => {
    writeAt(root, 'a.txt', 'a');
    writeAt(root, 'b.txt', 'b');
    const reader = await createCandidateReader(root);
    vi.mocked(realpath).mockResolvedValueOnce(path.join(root, 'b.txt'));
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader silent failures', () => {
  it('resolves null for a disappeared candidate and keeps the reader usable', async () => {
    writeAt(root, 'present.txt', 'present');
    const reader = await createCandidateReader(root);
    expect(await reader('missing.txt')).toBeNull();
    expect(await reader('present.txt')).toBe('present');
  });

  it('resolves null when lstat rejects and keeps the reader usable', async () => {
    writeAt(root, 'a.txt', 'a');
    writeAt(root, 'b.txt', 'b');
    const reader = await createCandidateReader(root);
    vi.mocked(lstat).mockRejectedValueOnce(new Error('EACCES'));
    expect(await reader('a.txt')).toBeNull();
    expect(await reader('b.txt')).toBe('b');
  });

  it('resolves null when candidate realpath rejects and keeps the reader usable', async () => {
    writeAt(root, 'a.txt', 'a');
    writeAt(root, 'b.txt', 'b');
    const reader = await createCandidateReader(root);
    vi.mocked(realpath).mockRejectedValueOnce(new Error('EACCES'));
    expect(await reader('a.txt')).toBeNull();
    expect(await reader('b.txt')).toBe('b');
  });

  it('resolves null when the content read rejects and keeps the reader usable', async () => {
    writeAt(root, 'a.txt', 'a');
    writeAt(root, 'b.txt', 'b');
    const reader = await createCandidateReader(root);
    vi.mocked(readFile).mockRejectedValueOnce(new Error('EACCES'));
    expect(await reader('a.txt')).toBeNull();
    expect(await reader('b.txt')).toBe('b');
  });

  it('resolves to an always-null reader when root canonicalization rejects', async () => {
    writeAt(root, 'a.txt', 'a');
    vi.mocked(realpath).mockRejectedValueOnce(new Error('EACCES'));
    const reader = await createCandidateReader(root);
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader home-secret roots', () => {
  it('yields no contents when the root is below the mocked home .ssh anchor', async () => {
    const workspace = path.join(homeDirectory, '.ssh', 'workspace');
    writeAt(workspace, 'notes.txt', 'notes');
    const reader = await createCandidateReader(workspace);
    expect(await reader('notes.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('yields no contents when the root resolves inside a linked home secret entry', async () => {
    const secretTarget = path.join(homeDirectory, 'aws-real');
    writeAt(secretTarget, 'credentials.txt', 'credentials');
    symlinkSync(secretTarget, path.join(homeDirectory, '.aws'));
    const reader = await createCandidateReader(secretTarget);
    expect(await reader('credentials.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});

describe('createCandidateReader policy caching', () => {
  it('canonicalizes the root and initializes home anchors once for many candidates', async () => {
    writeAt(root, 'one.txt', 'one');
    writeAt(root, 'two.txt', 'two');
    const reader = await createCandidateReader(root);
    expect(await reader('one.txt')).toBe('one');
    expect(await reader('two.txt')).toBe('two');
    expect(vi.mocked(homedir)).toHaveBeenCalledTimes(1);
    const targets = vi.mocked(realpath).mock.calls.map(([target]) => target);
    expect(targets.filter((target) => target === root)).toHaveLength(1);
    expect(targets.filter((target) => target === path.join(root, 'one.txt'))).toHaveLength(1);
    expect(targets.filter((target) => target === path.join(root, 'two.txt'))).toHaveLength(1);
  });
});

describe('createCandidateReader abort checks', () => {
  it('starts no root work when the factory is created with an aborted signal', async () => {
    writeAt(root, 'a.txt', 'a');
    const controller = new AbortController();
    controller.abort();
    const reader = await createCandidateReader(root, controller.signal);
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(realpath)).not.toHaveBeenCalled();
    expect(vi.mocked(lstat)).not.toHaveBeenCalled();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('resolves an always-null reader when abort happens during root canonicalization', async () => {
    writeAt(root, 'a.txt', 'a');
    const gate = Promise.withResolvers<string>();
    vi.mocked(realpath).mockReturnValueOnce(gate.promise);
    const controller = new AbortController();
    const pending = createCandidateReader(root, controller.signal);
    controller.abort();
    gate.resolve(root);
    const reader = await pending;
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(realpath)).toHaveBeenCalledOnce();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('stops after a pending ancestor lstat when aborted', async () => {
    writeAt(root, 'dir/notes.txt', 'notes');
    const controller = new AbortController();
    const reader = await createCandidateReader(root, controller.signal);
    const gate = Promise.withResolvers<Stats>();
    vi.mocked(lstat).mockReturnValueOnce(gate.promise);
    const pending = reader('dir/notes.txt');
    controller.abort();
    gate.resolve({ isDirectory: () => true } as Stats);
    expect(await pending).toBeNull();
    expect(vi.mocked(lstat)).toHaveBeenCalledOnce();
    expect(vi.mocked(lstat).mock.calls[0]?.[0]).toBe(path.join(root, 'dir'));
    expect(vi.mocked(realpath)).toHaveBeenCalledOnce();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('stops after a pending final lstat when aborted', async () => {
    writeAt(root, 'a.txt', 'a');
    const controller = new AbortController();
    const reader = await createCandidateReader(root, controller.signal);
    const gate = Promise.withResolvers<Stats>();
    vi.mocked(lstat).mockReturnValueOnce(gate.promise);
    const pending = reader('a.txt');
    controller.abort();
    gate.resolve({ isFile: () => true, size: 1 } as Stats);
    expect(await pending).toBeNull();
    expect(vi.mocked(realpath)).toHaveBeenCalledOnce();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('stops after a pending candidate realpath when aborted', async () => {
    writeAt(root, 'a.txt', 'a');
    const controller = new AbortController();
    const reader = await createCandidateReader(root, controller.signal);
    const gate = Promise.withResolvers<string>();
    vi.mocked(realpath).mockReturnValueOnce(gate.promise);
    const pending = reader('a.txt');
    controller.abort();
    gate.resolve(path.join(root, 'a.txt'));
    expect(await pending).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('stops immediately before content when aborted at the last boundary', async () => {
    writeAt(root, 'a.txt', 'a');
    const controller = new AbortController();
    const reader = await createCandidateReader(root, controller.signal);
    vi.mocked(realpath).mockImplementationOnce(async (target) => {
      controller.abort();
      return String(target);
    });
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  it('passes the signal to readFile and resolves null when content is aborted', async () => {
    writeAt(root, 'a.txt', 'a');
    const controller = new AbortController();
    const reader = await createCandidateReader(root, controller.signal);
    vi.mocked(readFile).mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    expect(await reader('a.txt')).toBeNull();
    expect(vi.mocked(readFile)).toHaveBeenCalledWith(path.join(root, 'a.txt'), { signal: controller.signal });
  });
});

describe('scan timeout with the candidate reader', () => {
  it('keeps the timeout ending and never starts content after late metadata settles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    writeAt(root, 'late.txt', 'late text');
    const metadata = Promise.withResolvers<Stats>();
    const metadataStarted = Promise.withResolvers<void>();
    vi.mocked(lstat).mockImplementationOnce(async () => {
      metadataStarted.resolve();
      return metadata.promise;
    });
    const scanArgs: FileGrepArgs = {
      pattern: 'late',
      include: '',
      exclude: '',
      literal: false,
      word: false,
      caseSensitive: false,
      limit: 10,
      path: undefined,
    };
    const scanning = scanFiles(root, ['late.txt'], scanArgs, 1100);

    await metadataStarted.promise;
    await vi.advanceTimersByTimeAsync(100);
    await expect(scanning).resolves.toEqual({ rows: [], ending: { kind: 'timeout' } });

    metadata.resolve({ isFile: () => true, size: 9 } as Stats);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });
});
