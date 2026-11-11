import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_READ_MAX_LIMIT, FILE_READ_USAGE, parseFileRead, type FileReadArgs } from './command.js';
import { FILE_READ_MAX_BYTES, readWorkspaceCommand, readWorkspaceLines } from './read.js';

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-read-'));
  outside = mkdtempSync(path.join(tmpdir(), 'janus-file-read-outside-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function args(filePath: string, offset = 1, limit = FILE_READ_MAX_LIMIT): FileReadArgs {
  return { path: filePath, offset, limit };
}

function write(relative: string, content: string | Buffer): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function read(filePath: string): string {
  return readWorkspaceLines(root, args(filePath));
}

describe('readWorkspaceLines reading text', () => {
  it('returns numbered lines through the formatter', () => {
    write('a.md', 'one\ntwo\nthree\n');
    expect(read('a.md')).toBe('1\tone\n2\ttwo\n3\tthree');
  });

  it('passes offset and limit to the formatter', () => {
    write('a.md', 'one\ntwo\nthree\nfour\n');
    const parsed = parseFileRead('file read a.md --offset 2 --limit 2');
    if ('error' in parsed) throw new Error(parsed.error);
    expect(readWorkspaceLines(root, parsed)).toBe('2\ttwo\n3\tthree\n(showing lines 2-3 of 4; continue with --offset 4)');
  });

  it('drops a leading UTF-8 byte-order mark', () => {
    write('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('first\n')]));
    expect(read('bom.txt')).toBe('1\tfirst');
  });

  it('returns the formatter error for an offset past the end, naming the path as given', () => {
    write('a.md', 'one\n');
    expect(readWorkspaceLines(root, args('./a.md', 5))).toBe('Offset past end of file (1 lines): ./a.md.');
  });

  it('reads a file of exactly the size cap', () => {
    write('max.txt', 'a'.repeat(FILE_READ_MAX_BYTES));
    expect(readWorkspaceLines(root, args('max.txt', 1, 1))).toBe(`1\t${'a'.repeat(2000)}…`);
  });

  it('reads .envrc and a file inside a directory named .env', () => {
    write('.envrc', 'export A=1\n');
    write('.env/bin/activate', 'source me\n');
    expect(read('.envrc')).toBe('1\texport A=1');
    expect(read('.env/bin/activate')).toBe('1\tsource me');
  });
});

describe('readWorkspaceLines missing files and types', () => {
  it('reports a missing file', () => {
    expect(read('missing.txt')).toBe('File not found: missing.txt.');
  });

  it('reports a dangling symlink as missing', () => {
    symlinkSync(path.join(root, 'nowhere'), path.join(root, 'dangling'));
    symlinkSync(path.join(outside, 'nowhere'), path.join(root, 'dangling-out'));
    expect(read('dangling')).toBe('File not found: dangling.');
    expect(read('dangling-out')).toBe('File not found: dangling-out.');
  });

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('reports an existing file without read permission as not found', () => {
    write('locked.txt', 'secret');
    chmodSync(path.join(root, 'locked.txt'), 0o000);
    expect(read('locked.txt')).toBe('File not found: locked.txt.');
  });

  it('reports a path under a regular file as missing', () => {
    write('a.txt', 'x');
    expect(read('a.txt/b')).toBe('File not found: a.txt/b.');
  });

  it('reports directories, including the root itself', () => {
    mkdirSync(path.join(root, 'a'));
    expect(read('a')).toBe('Is a directory: a.');
    expect(read('.')).toBe('Is a directory: ..');
    expect(read('a/..')).toBe('Is a directory: a/...');
  });

  it('refuses invalid UTF-8 and NUL bytes', () => {
    write('bad.bin', Buffer.from([0x61, 0xff, 0xfe, 0x62]));
    write('nul.bin', Buffer.from('a\u{0}b'));
    expect(read('bad.bin')).toBe('Not a text file: bad.bin.');
    expect(read('nul.bin')).toBe('Not a text file: nul.bin.');
  });

  it('refuses a file over the size cap', () => {
    write('big.txt', '');
    truncateSync(path.join(root, 'big.txt'), FILE_READ_MAX_BYTES + 1);
    expect(read('big.txt')).toBe('File too large (>5 MB): big.txt.');
  });
});

describe('readWorkspaceLines socket', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
    server = undefined;
  });

  it('refuses a Unix socket', async () => {
    const socketPath = path.join(root, 's.sock');
    server = createServer();
    await new Promise<void>((resolve) => server?.listen(socketPath, resolve));
    expect(read('s.sock')).toBe('Not a text file: s.sock.');
  });
});

describe('readWorkspaceLines containment', () => {
  it('refuses paths that escape the root lexically', () => {
    writeFileSync(path.join(outside, 'x'), 'secret');
    const absolute = path.join(outside, 'x');
    expect(read('../x')).toBe('Outside the workspace: ../x.');
    expect(read('..')).toBe('Outside the workspace: ...');
    expect(read(absolute)).toBe(`Outside the workspace: ${absolute}.`);
  });

  it('refuses a symlink escaping the root', () => {
    writeFileSync(path.join(outside, 'x'), 'secret');
    symlinkSync(path.join(outside, 'x'), path.join(root, 'link'));
    expect(read('link')).toBe('Outside the workspace: link.');
  });

  it('reports a path that is both outside and secret as outside', () => {
    expect(read('../.env')).toBe('Outside the workspace: ../.env.');
  });
});

describe('readWorkspaceLines secrets', () => {
  it.each(['.env', 'config/.env.local', '.env.example', '.ENV'])('refuses %s', (name) => {
    write(name, 'KEY=1\n');
    expect(read(name)).toBe(`Secret file: ${name}.`);
  });

  it.each(['.ssh/id_rsa', 'notes/.ssh/key', '.config/gh/hosts.yml'])('refuses %s', (name) => {
    write(name, 'token\n');
    expect(read(name)).toBe(`Secret file: ${name}.`);
  });

  it('refuses a symlink pointing at .env', () => {
    write('.env', 'KEY=1\n');
    symlinkSync(path.join(root, '.env'), path.join(root, 'plain'));
    expect(read('plain')).toBe('Secret file: plain.');
  });

  it('refuses a symlink named .env pointing at an ordinary file', () => {
    write('plain.txt', 'hello\n');
    symlinkSync(path.join(root, 'plain.txt'), path.join(root, '.env'));
    expect(read('.env')).toBe('Secret file: .env.');
  });

  it('reports a missing secret as secret', () => {
    expect(read('.env')).toBe('Secret file: .env.');
    expect(read('foo/../.env')).toBe('Secret file: foo/../.env.');
  });
});

describe('readWorkspaceLines secrets under the home directory', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'janus-file-read-home-'));
    vi.stubEnv('HOME', home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  function writeAt(base: string, relative: string, content: string): void {
    const target = path.join(base, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  it.each([
    ['.config', 'gh/hosts.yml'],
    ['.ssh', 'id_rsa'],
    ['.local/share', 'opencode/auth.json'],
  ])('refuses a secret under a root at ~/%s', (rootEntry, name) => {
    writeAt(path.join(home, rootEntry), name, 'token\n');
    expect(readWorkspaceLines(path.join(home, rootEntry), args(name))).toBe(`Secret file: ${name}.`);
  });

  it('reads an ordinary file under a root at ~/.config', () => {
    writeAt(path.join(home, '.config'), 'other.txt', 'hello\n');
    expect(readWorkspaceLines(path.join(home, '.config'), args('other.txt'))).toBe('1\thello');
  });

  it('reads a file under a .ssh ancestor that is not in the home directory', () => {
    const projectRoot = path.join(outside, '.ssh', 'proj');
    writeAt(projectRoot, 'a.txt', 'hello\n');
    expect(readWorkspaceLines(projectRoot, args('a.txt'))).toBe('1\thello');
  });

  it('refuses a secret reached through the target of a symlinked ~/.config', () => {
    const dotfiles = path.join(outside, 'dotfiles', 'config');
    writeAt(dotfiles, 'gh/hosts.yml', 'token\n');
    symlinkSync(dotfiles, path.join(home, '.config'));
    expect(readWorkspaceLines(dotfiles, args('gh/hosts.yml'))).toBe('Secret file: gh/hosts.yml.');
  });

  it.each([
    ['.config', 'gh/hosts.yml'],
    ['.ssh', 'id_rsa'],
    ['.local/share', 'opencode/auth.json'],
  ])('reports a missing secret under a root at ~/%s as secret', (rootEntry, name) => {
    mkdirSync(path.join(home, rootEntry), { recursive: true });
    expect(readWorkspaceLines(path.join(home, rootEntry), args(name))).toBe(`Secret file: ${name}.`);
  });

  it('reports a missing secret under the target of a symlinked ~/.config as secret', () => {
    const dotfiles = path.join(outside, 'dotfiles', 'config');
    mkdirSync(dotfiles, { recursive: true });
    symlinkSync(dotfiles, path.join(home, '.config'));
    expect(readWorkspaceLines(dotfiles, args('gh/hosts.yml'))).toBe('Secret file: gh/hosts.yml.');
  });

  it('reports an in-root symlink to a home secret outside the root as outside', () => {
    writeAt(home, '.ssh/id_rsa', 'key\n');
    symlinkSync(path.join(home, '.ssh', 'id_rsa'), path.join(root, 'link'));
    expect(read('link')).toBe('Outside the workspace: link.');
  });

  it('reports a missing file under an in-root symlink to ~/.ssh as not found', () => {
    mkdirSync(path.join(home, '.ssh'), { recursive: true });
    symlinkSync(path.join(home, '.ssh'), path.join(root, 'dir'));
    expect(read('dir/key')).toBe('File not found: dir/key.');
  });

  it('reports a missing ordinary file under a root at ~/.config as not found', () => {
    mkdirSync(path.join(home, '.config'), { recursive: true });
    expect(readWorkspaceLines(path.join(home, '.config'), args('other.txt'))).toBe('File not found: other.txt.');
  });
});

describe('readWorkspaceCommand', () => {
  it('answers the usage line for a malformed command', () => {
    expect(readWorkspaceCommand(root, 'file read')).toBe(FILE_READ_USAGE);
  });

  it('answers numbered text for a valid command', () => {
    write('a.md', 'one\ntwo\n');
    expect(readWorkspaceCommand(root, 'file read a.md --limit 1')).toBe('1\tone\n(showing lines 1-1 of 2; continue with --offset 2)');
  });
});
