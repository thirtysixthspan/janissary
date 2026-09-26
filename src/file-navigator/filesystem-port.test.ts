import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalFileSystemPort } from './filesystem-port.js';
import { OUTSIDE_ROOT_REASON } from './file-operation-result.js';

let roots: string[] = [];

function tree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-local-port-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'notes.txt'), 'notes');
  writeFileSync(path.join(root, 'src', 'a.ts'), 'a');
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const port = new LocalFileSystemPort();

// A row the tree does not contain is not an error the caller can render — it is a row the client
// asked about that the server will not answer. Every one of these paths leaves the root rather than
// reaching the filesystem, which is the property worth pinning: nothing outside the tree is read,
// written, watched, or staged.
describe('LocalFileSystemPort paths that leave the tree', () => {
  const outside = '../outside';

  it('reads a directory as empty rather than reaching outside it', () => {
    expect(port.readDirectory(tree(), outside)).toEqual([]);
  });

  it('answers a watch of a path outside the tree with an inert handle', () => {
    const handle = port.watch(tree(), outside, () => {});
    expect(() => { handle.stop(); }).not.toThrow();
  });

  it('refuses to read a file outside the tree', async () => {
    await expect(port.readFile(tree(), outside)).rejects.toThrow(OUTSIDE_ROOT_REASON);
  });

  it('refuses to write a file outside the tree', () => {
    const result = port.writeFile(tree(), outside, Buffer.from('x'));
    expect(result).toEqual({ ok: false, reason: OUTSIDE_ROOT_REASON });
  });

  it('refuses to create a file or directory outside the tree', () => {
    const root = tree();
    expect(port.createFile(root, outside)).toEqual({ ok: false, reason: OUTSIDE_ROOT_REASON });
    expect(port.createDirectory(root, outside)).toEqual({ ok: false, reason: OUTSIDE_ROOT_REASON });
  });

  it('refuses a commit naming a path outside the tree, without staging anything', async () => {
    // The whole set is refused rather than staged piecemeal: half a commit is not a coherent thing
    // to make, so one escaping path refuses the request before git is reached at all.
    await expect(port.commit(tree(), 'commit: a', ['src/a.ts', outside]))
      .rejects.toThrow(OUTSIDE_ROOT_REASON);
  });
});

describe('LocalFileSystemPort reading a real tree', () => {
  it('reads a subdirectory, and the tree root itself', () => {
    const root = tree();
    expect(port.readDirectory(root, 'src').map((entry) => entry.name)).toEqual(['a.ts']);
    expect(port.readDirectory(root, '').map((entry) => entry.name).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(['notes.txt', 'src']);
  });

  it('reads a file back as its bytes', async () => {
    const root = tree();
    await expect(port.readFile(root, 'notes.txt')).resolves.toEqual(Buffer.from('notes'));
  });

  it('reports a row that is not there as a null stat rather than a miss', () => {
    const root = tree();
    const rows = port.statRows(root, ['notes.txt', 'gone.txt']);
    expect(rows['notes.txt']).toMatchObject({ size: 5 });
    expect(rows['gone.txt']).toBeNull();
  });

  it('watches a directory that is there, and its handle stops cleanly', () => {
    const root = tree();
    const handle = port.watch(root, 'src', () => {});
    expect(() => { handle.stop(); }).not.toThrow();
  });

  // A watch on a directory that has gone is not an error worth failing a tree render over: the
  // handle is inert, so the row simply stops refreshing live and the user can still toggle it.
  it('answers a watch of a directory that is not there with an inert handle', () => {
    const root = tree();
    const handle = port.watch(root, 'no-such-dir', () => {});
    expect(() => { handle.stop(); }).not.toThrow();
  });
});

describe('LocalFileSystemPort creating entries', () => {
  // The name is offered, not created: `createFile` answers the path it would take and the client's
  // own create call is what writes it, so a navigator can show the new row before it exists.
  it('offers a free name in an existing directory', () => {
    const root = tree();
    expect(port.createFile(root, 'src')).toEqual({ ok: true, value: { path: 'src/untitled.md' } });
    expect(port.createFile(root, '')).toEqual({ ok: true, value: { path: 'untitled.md' } });
  });

  it('steps to the next free name rather than proposing one that exists', () => {
    const root = tree();
    writeFileSync(path.join(root, 'untitled.md'), '');
    expect(port.createFile(root, '')).toEqual({ ok: true, value: { path: 'untitled-2.md' } });
  });

  it('refuses to create in a directory that is not there', () => {
    const root = tree();
    expect(port.createFile(root, 'no-such-dir'))
      .toEqual({ ok: false, reason: OUTSIDE_ROOT_REASON });
  });

  // The destination names the directory to create *in*, exactly as it does for a file: the tree
  // already holds it, and the entry made is a fresh one inside it.
  it('actually creates the directory it names inside an existing one', () => {
    const root = tree();
    expect(port.createDirectory(root, 'src')).toEqual({ ok: true, value: { path: 'src/untitled' } });
    expect(existsSync(path.join(root, 'src', 'untitled'))).toBe(true);
  });
});
