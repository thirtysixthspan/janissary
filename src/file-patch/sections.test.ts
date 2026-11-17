import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { buildPatchChanges, type PatchRecord } from './changes.js';
import { createMoveRegistry, recordMove } from './move-chains.js';
import { parsePatchText } from './parse.js';
import { patchRows } from './rows.js';
import { applySections } from './sections.js';
import type { PatchContent, PatchPlace } from './view-entry.js';
import { createPatchView, type PatchViewReads } from './view.js';

let root: string;
beforeEach(() => { root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-sections-'))); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function write(name: string, value: string): void {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}
function apply(text: string) {
  const parsed = parsePatchText(text);
  if ('error' in parsed) throw new Error(JSON.stringify(parsed.error));
  return applySections(createPatchView(root), parsed.sections);
}
function success(text: string) {
  const result = apply(text);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

describe('patch sections', () => {
  it('moves files with hunks, BOMs and nested destinations', () => {
    write('a', '\u{FEFF}old\n');
    const moved = success('*** Update File: a\n*** Move to: dir/sub/b\n@@\n-old\n+new');
    expect(moved.rows).toEqual([{ letter: 'R', path: 'a', target: 'dir/sub/b' }]);
    expect(moved.changes.moves.map((hop) => [hop.from.requested, hop.to.requested, hop.link])).toEqual([['a', 'dir/sub/b', false]]);
    expect(moved.changes.writes).toMatchObject([{ text: 'new\n', bom: true, finalPlace: { requested: 'dir/sub/b' }, place: { requested: 'dir/sub/b' } }]);
    expect(moved.changes.folders).toEqual([path.join(root, 'dir'), path.join(root, 'dir/sub')]);
    expect(success('*** Update File: a\n*** Move to: b').changes.writes).toEqual([]);
  });

  it('validates move source, target, hunks and paths in order', () => {
    write('a', 'old\n'); write('b', 'other\n');
    for (const [text, reason] of [
      ['*** Update File: missing\n*** Move to: c', 'File not found'],
      ['*** Update File: a\n*** Move to: b', 'File already exists'],
      ['*** Update File: a\n*** Move to: a', 'File already exists'],
      ['*** Update File: a\n*** Move to: ../outside', 'Outside the workspace'],
      ['*** Update File: a\n*** Move to: .git/b', 'Protected file'],
    ]) expect(apply(text)).toMatchObject({ ok: false, section: 1, marker: expect.stringContaining('Update File:'), reason });
    expect(apply('*** Update File: a\n*** Move to: b\n@@\n-wrong\n+new')).toEqual({ ok: false, section: 1, marker: 'Update File: a', hunkLine: 'wrong' });
    expect(apply('*** Update File: a\n*** Move to: c\n*** Add File: a/b.txt\n+x')).toMatchObject({ ok: false, section: 2, reason: 'Filesystem error ENOTDIR; check the item and destination, then try again' });
  });

  it('derives rows, deletes and writes for overwritten and vacated paths', () => {
    write('a', 'old\n'); write('b', 'other\n');
    const replaced = success('*** Delete File: b\n*** Update File: a\n*** Move to: b');
    expect(replaced.rows).toEqual([{ letter: 'M', path: 'b' }, { letter: 'D', path: 'a' }]);
    expect(replaced.changes.deletes.map((item) => item.place.requested)).toEqual(['b']);
    expect(replaced.changes.moves).toHaveLength(1);
    const readded = success('*** Update File: a\n*** Move to: c\n*** Add File: a\n+new');
    expect(readded.rows).toEqual([{ letter: 'M', path: 'a' }, { letter: 'A', path: 'c' }]);
    expect(readded.changes.moves).toHaveLength(1);
    expect(readded.changes.deletes).toEqual([]);
    expect(readded.changes.writes).toMatchObject([{ text: 'new\n', place: { requested: 'a' } }]);
  });

  it('derives a net row for a destination that was moved away earlier', () => {
    write('a', 'a\n'); write('b', 'b\n');
    const vacated = success('*** Update File: b\n*** Move to: c\n*** Update File: a\n*** Move to: b');
    expect(vacated.rows).toEqual([{ letter: 'M', path: 'b' }, { letter: 'A', path: 'c' }, { letter: 'D', path: 'a' }]);
    expect(vacated.rows.some((row) => row.letter === 'R')).toBe(false);
  });

  it('preserves ordered hops, chains and net changes', () => {
    write('a', 'a\n'); write('b', 'b\n');
    const chain = success('*** Update File: a\n*** Move to: t\n*** Update File: t\n*** Move to: dir/c');
    expect(chain.rows).toEqual([{ letter: 'R', path: 'a', target: 'dir/c' }]);
    expect(chain.changes.moves.map((hop) => [hop.from.requested, hop.to.requested])).toEqual([['a', 't'], ['t', 'dir/c']]);
    const intermediate = success('*** Update File: a\n*** Move to: nested/t\n*** Update File: nested/t\n*** Move to: c');
    expect(intermediate.changes.folders).toEqual([path.join(root, 'nested')]);
    const back = success('*** Update File: a\n*** Move to: t\n*** Update File: t\n*** Move to: a');
    expect(back.rows).toEqual([{ letter: 'M', path: 'a' }]);
    expect(back.changes.moves).toEqual([]);
    expect(back.changes.deletes).toEqual([]);
    const deleted = success('*** Update File: a\n*** Move to: t\n*** Delete File: t');
    expect(deleted.rows).toEqual([{ letter: 'D', path: 'a' }]);
    expect(deleted.changes.deletes.map((item) => item.place.requested)).toEqual(['a']);
    expect(deleted.changes.moves).toEqual([]);
    expect(deleted.changes.writes).toEqual([]);
    const recreated = success('*** Update File: a\n*** Move to: t\n*** Delete File: t\n*** Add File: t\n+replacement');
    expect(recreated.rows).toEqual([{ letter: 'R', path: 'a', target: 't' }]);
    expect(recreated.changes.moves).toHaveLength(1);
    expect(recreated.changes.writes).toMatchObject([{ text: 'replacement\n', finalPlace: { requested: 't' } }]);
    const added = success('*** Add File: x\n+new\n*** Update File: x\n*** Move to: y');
    expect(added.rows).toEqual([{ letter: 'A', path: 'y' }]);
    expect(added.changes.moves).toEqual([]);
    expect(added.changes.writes).toMatchObject([{ text: 'new\n', finalPlace: { requested: 'y' } }]);
    const exchange = success('*** Update File: a\n*** Move to: t\n*** Update File: b\n*** Move to: a\n*** Update File: t\n*** Move to: b');
    expect(exchange.rows).toEqual([{ letter: 'M', path: 'a' }, { letter: 'M', path: 'b' }]);
    expect(exchange.changes.moves.map((hop) => [hop.from.requested, hop.to.requested])).toEqual([['a', 't'], ['b', 'a'], ['t', 'b']]);
  });

  it('moves links and follows changed targets in the view', () => {
    write('a', 'old\n'); write('b', 'other\n'); symlinkSync('a', path.join(root, 'link'));
    const movedLink = success('*** Update File: link\n*** Move to: moved\n*** Update File: moved\n@@\n-old\n+new');
    expect(movedLink.changes.moves).toMatchObject([{ link: true, to: { linkText: 'a' } }]);
    expect(movedLink.changes.writes).toMatchObject([{ text: 'new\n', content: { realPath: path.join(root, 'a') } }]);
    expect(apply('*** Update File: a\n*** Move to: c\n*** Update File: link\n@@\n-old\n+new')).toMatchObject({ ok: false, section: 2, reason: 'Not a text file' });
    const readded = success('*** Update File: a\n*** Move to: c\n*** Add File: a\n+replacement\n*** Update File: link\n@@\n-replacement\n+new');
    expect(readded.changes.writes.map((item) => item.text)).toEqual(['new\n']);
    symlinkSync('b', path.join(root, 'link-b'));
    const replaced = success('*** Delete File: b\n*** Update File: a\n*** Move to: b\n*** Update File: link-b\n@@\n-old\n+new');
    expect(replaced.changes.writes).toMatchObject([{ text: 'new\n', finalPlace: { requested: 'b' } }]);
    const twice = success('*** Delete File: b\n*** Update File: a\n*** Move to: b\n*** Update File: link-b\n@@\n-old\n+one\n*** Update File: link-b\n@@\n-one\n+two');
    expect(twice.changes.writes).toMatchObject([{ text: 'two\n', finalPlace: { requested: 'b' } }]);
  });

  it('follows a moved relative link from its destination directory', () => {
    write('old/target', 'old\n');
    write('new/target', 'destination\n');
    symlinkSync('target', path.join(root, 'old/link'));
    const moved = success('*** Update File: old/link\n*** Move to: new/link\n*** Update File: new/link\n@@\n-destination\n+changed');
    expect(moved.changes.moves).toMatchObject([{ link: true, to: { linkText: 'target' } }]);
    expect(moved.rows).toEqual([{ letter: 'R', path: 'old/link', target: 'new/link' }]);
    expect(moved.changes.writes).toMatchObject([{ text: 'changed\n', content: { realPath: path.join(root, 'new/target') } }]);
    expect(moved.changes.writes.some((item) => item.content.realPath === path.join(root, 'old/target'))).toBe(false);
    write('third/target', 'third\n');
    const chained = success('*** Update File: old/link\n*** Move to: new/link\n*** Update File: new/link\n*** Move to: third/link\n*** Update File: third/link\n@@\n-third\n+changed');
    expect(chained.changes.moves).toHaveLength(2);
    expect(chained.rows).toContainEqual({ letter: 'R', path: 'old/link', target: 'third/link' });
    expect(chained.changes.writes).toMatchObject([{ text: 'changed\n', content: { realPath: path.join(root, 'third/target') } }]);
    const missingTarget = 'fourth/target';
    const added = success(`*** Add File: ${missingTarget}\n+added\n*** Update File: old/link\n*** Move to: fourth/link\n*** Update File: fourth/link\n@@\n-added\n+changed`);
    expect(added.changes.writes).toMatchObject([{ text: 'changed\n', content: { realPath: path.join(root, missingTarget) } }]);
    const named = success('*** Update File: old/link\n*** Move to: new/link\n*** Update File: new/link\n@@\n-destination\n+changed\n*** Update File: new/target\n@@\n-changed\n+again');
    expect(named.rows).toEqual([{ letter: 'R', path: 'old/link', target: 'new/link' }, { letter: 'M', path: 'new/target' }]);
    expect(apply('*** Update File: old/link\n*** Move to: missing/link\n*** Update File: missing/link\n@@\n-old\n+changed')).toMatchObject({ ok: false, section: 2, reason: 'Not a text file' });
  });

  it('orders rows by the first section naming each path', () => {
    write('target', 'old\n'); write('old', 'gone\n'); symlinkSync('target', path.join(root, 'link'));
    const result = success('*** Update File: link\n@@\n-old\n+changed\n*** Delete File: old\n*** Update File: target\n@@\n-changed\n+again');
    expect(result.rows).toEqual([{ letter: 'M', path: 'link' }, { letter: 'D', path: 'old' }, { letter: 'M', path: 'target' }]);
  });

  it('refuses moved links that resolve outside or into protected paths', () => {
    write('inside/target', 'old\n');
    symlinkSync('../inside/target', path.join(root, 'inside/link'));
    expect(apply('*** Update File: inside/link\n*** Move to: link\n*** Update File: link\n@@\n-old\n+changed')).toMatchObject({ ok: false, section: 2, reason: 'Outside the workspace' });
    write('safe/target', 'old\n');
    symlinkSync('target', path.join(root, 'safe/link'));
    expect(apply('*** Update File: safe/link\n*** Move to: .git/link')).toMatchObject({ ok: false, section: 1, reason: 'Protected file' });
  });
  it('refuses a moved link whose new target resolves into a protected directory', () => {
    write('old/target', 'old\n');
    write('.git/secret', 'old\n');
    write('new/placeholder', '');
    symlinkSync('target', path.join(root, 'old/link'));
    symlinkSync('../.git/secret', path.join(root, 'new/target'));
    expect(apply('*** Update File: old/link\n*** Move to: new/link\n*** Update File: new/link\n@@\n-old\n+changed'))
      .toMatchObject({ ok: false, section: 2, reason: 'Protected file' });
  });
  it('allows entry operations on a moved link with a missing target', () => {
    write('old/target', 'old\n');
    symlinkSync('target', path.join(root, 'old/link'));
    const prefix = '*** Update File: old/link\n*** Move to: missing/link';
    const deleted = success(`${prefix}\n*** Delete File: missing/link`);
    expect(deleted.rows).toEqual([{ letter: 'D', path: 'old/link' }]);
    expect(deleted.changes.moves).toEqual([]);
    expect(deleted.changes.deletes).toMatchObject([{ place: { requested: 'old/link' }, linkText: 'target' }]);
    const moved = success(`${prefix}\n*** Update File: missing/link\n*** Move to: next/link`);
    expect(moved.rows).toEqual([{ letter: 'R', path: 'old/link', target: 'next/link' }]);
    expect(moved.changes.moves).toHaveLength(2);
    for (const suffix of [
      '*** Update File: missing/link\n@@\n-old\n+new',
      '*** Update File: missing/link\n*** Move to: next/link\n@@\n-old\n+new',
    ]) expect(apply(`${prefix}\n${suffix}`)).toMatchObject({ ok: false, section: 2, reason: 'Not a text file' });
    symlinkSync('absent', path.join(root, 'old/dangling'));
    for (const suffix of ['*** Delete File: old/dangling', '*** Update File: old/dangling\n*** Move to: next/link']) {
      expect(apply(suffix)).toMatchObject({ ok: false, section: 1, reason: 'Not a text file' });
    }
  });
  it('derives ordered changes and leaves disk untouched', () => {
    write('edit', 'old\n'); write('delete', 'keep');
    const result = success('*** Add File: a/b/new\n+new\n*** Update File: edit\n@@\n-old\n+updated\n*** Delete File: delete');
    expect(result.rows).toEqual([{ letter: 'A', path: 'a/b/new' }, { letter: 'M', path: 'edit' }, { letter: 'D', path: 'delete' }]);
    expect(result.changes.folders).toEqual([path.join(root, 'a'), path.join(root, 'a/b')]);
    expect(result.changes.writes.map((item) => item.text)).toEqual(['new\n', 'updated\n']);
    expect(result.changes.deletes.map((item) => item.place.requested)).toEqual(['delete']);
    expect(readFileSync(path.join(root, 'edit'), 'utf8')).toBe('old\n');
    expect(readFileSync(path.join(root, 'delete'), 'utf8')).toBe('keep');
    expect(existsSync(path.join(root, 'a'))).toBe(false);
  });

  it('collapses successive operations and retains delete and add', () => {
    write('a', 'old\n');
    const replaced = success('*** Delete File: a\n*** Add File: a\n+new');
    expect(replaced.rows).toEqual([{ letter: 'M', path: 'a' }]);
    expect(replaced.changes.deletes).toHaveLength(1);
    expect(replaced.changes.writes[0].text).toBe('new\n');
    const vanished = success('*** Add File: dir/b\n+x\n*** Delete File: dir/b');
    expect(vanished.rows).toEqual([]);
    expect(vanished.changes).toEqual({ folders: [], deletes: [], writes: [], moves: [] });
    const updated = success('*** Update File: a\n@@\n-old\n+one\n*** Update File: a\n@@\n-one\n+two');
    expect(updated.changes.writes.map((item) => item.text)).toEqual(['two\n']);
    const deleted = success('*** Update File: a\n@@\n-old\n+one\n*** Delete File: a');
    expect(deleted.rows).toEqual([{ letter: 'D', path: 'a' }]);
    expect(deleted.changes.writes).toEqual([]);
    expect(deleted.changes.deletes).toHaveLength(1);
  });

  it('reports existence, path, and hunk errors in section order', () => {
    write('a', 'old\n');
    for (const [text, reason] of [
      ['*** Add File: a\n+x', 'File already exists'], ['*** Delete File: absent', 'File not found'],
      ['*** Update File: absent\n@@\n-x\n+y', 'File not found'], ['*** Add File: ../outside\n+x', 'Outside the workspace'],
      ['*** Add File: .git/x\n+x', 'Protected file'],
    ]) expect(apply(text)).toMatchObject({ ok: false, section: 1, reason });
    expect(apply('*** Delete File: a\n*** Add File: a/b\n+x')).toMatchObject({ ok: false, section: 2, reason: 'Filesystem error ENOTDIR; check the item and destination, then try again' });
    expect(apply('*** Add File: dir/new\n+x\n*** Delete File: a\n*** Update File: absent\n@@\n-x\n+y')).toMatchObject({ ok: false, section: 3, marker: 'Update File: absent', reason: 'File not found' });
    expect(apply('*** Update File: a\n@@\n-wrong\n+new')).toEqual({ ok: false, section: 1, marker: 'Update File: a', hunkLine: 'wrong' });
    expect(readFileSync(path.join(root, 'a'), 'utf8')).toBe('old\n');
    expect(existsSync(path.join(root, 'dir'))).toBe(false);
  });

  it('validates text including the retained BOM', () => {
    for (const [value, reason] of [['\0', 'Not a text file'], ['\u{D800}', 'Not a text file'], ['x'.repeat(FILE_POLICY_MAX_BYTES), 'File too large (>5 MB)']]) {
      expect(apply(`*** Add File: a\n+${value}`)).toMatchObject({ ok: false, reason });
    }
    write('bom', '\u{FEFF}x');
    expect(apply(`*** Update File: bom\n@@\n-x\n+${'x'.repeat(FILE_POLICY_MAX_BYTES - 2)}`)).toMatchObject({ ok: false, reason: 'File too large (>5 MB)' });
    expect(success('*** Update File: bom\n@@\n-x\n+y').changes.writes[0].bom).toBe(true);
    expect(success('*** Delete File: bom\n*** Add File: bom\n+y').changes.writes[0].bom).toBe(false);
    expect(success('*** Add File: empty').changes.writes[0].text).toBe('');
  });

  it('handles links, shared content, and recreation', () => {
    write('target', 'old\n'); symlinkSync('target', path.join(root, 'link'));
    const updated = success('*** Update File: link\n@@\n-old\n+one\n*** Update File: target\n@@\n-one\n+two');
    expect(updated.changes.writes.map((item) => item.text)).toEqual(['two\n']);
    expect(updated.changes.writes[0].content.realPath).toBe(path.join(root, 'target'));
    expect(success('*** Delete File: link').changes.writes).toEqual([]);
    const replaced = success('*** Delete File: link\n*** Add File: link\n+new');
    expect(replaced.changes.deletes[0].linkText).toBe('target');
    expect(replaced.changes.writes[0].content.realPath).toBe(path.join(root, 'link'));
    expect(replaced.changes.deletes[0].content.current).toBe('old\n');
    for (const section of ['*** Update File: link\n@@\n-old\n+new', '*** Delete File: link', '*** Add File: link\n+new']) {
      expect(apply(`*** Delete File: target\n${section}`)).toMatchObject({ ok: false, section: 2, reason: 'Not a text file' });
    }
    expect(success('*** Delete File: target\n*** Add File: target\n+one\n*** Update File: link\n@@\n-one\n+two').changes.writes[0].text).toBe('two\n');
    const linkDeleted = success('*** Update File: link\n@@\n-old\n+new\n*** Delete File: link');
    expect(linkDeleted.changes.writes.map((item) => item.text)).toEqual(['new\n']);
    expect(linkDeleted.changes.deletes.map((item) => item.place.requested)).toEqual(['link']);
  });

  it('unlinks a deleted link re-added as a regular file and then moved', () => {
    write('target', 'old\n'); symlinkSync('target', path.join(root, 'link'));
    const result = success('*** Delete File: link\n*** Add File: link\n+new\n*** Update File: link\n*** Move to: moved');
    expect(result.changes.moves).toEqual([]);
    expect(result.changes.deletes).toMatchObject([{ place: { requested: 'link' }, linkText: 'target' }]);
    expect(result.changes.deletes).toHaveLength(1);
    expect(result.changes.writes).toMatchObject([{ text: 'new\n', finalPlace: { requested: 'moved' } }]);
    expect(result.changes.writes).toHaveLength(1);
    expect(result.rows).toEqual([{ letter: 'D', path: 'link' }, { letter: 'A', path: 'moved' }]);
  });

  it('keeps the original bytes of a vacated path that is re-created later', () => {
    write('a', 'first\n');
    const renamed = success('*** Update File: a\n*** Move to: b\n*** Delete File: b\n*** Add File: a\n+new');
    expect(renamed.rows).toEqual([{ letter: 'M', path: 'a' }]);
    expect(renamed.changes.deletes.map((item) => item.place.requested)).toEqual(['a']);
    expect(renamed.changes.deletes[0].content.original).toEqual(Buffer.from('first\n'));
    write('b', 'second\n');
    const recreated = success('*** Update File: b\n*** Move to: c\n*** Delete File: c\n*** Add File: b\n+new');
    expect(recreated.rows).toEqual([{ letter: 'M', path: 'b' }]);
    expect(recreated.changes.deletes.map((item) => item.place.requested)).toEqual(['b']);
    expect(recreated.changes.deletes[0].content.original).toEqual(Buffer.from('second\n'));
  });

  it('indexes removed locations once when deriving many writes', () => {
    let reads = 0;
    const places: PatchPlace[] = [];
    const record: PatchRecord = { deletes: new Map(), writes: new Map(), moves: createMoveRegistry(), removedByDelete: new Set() };
    for (let i = 0; i < 1000; i += 1) {
      const name = `file-${i}`;
      const content: PatchContent = { realPath: name, original: undefined, mode: undefined, hadBom: false, current: name };
      const place: PatchPlace = { requested: name, get location() { reads += 1; return name; }, existed: true,
        exists: i % 2 === 0, linkText: undefined, missingFolders: [], content };
      places.push(place);
      record.writes.set(content, { place, fromAdd: false });
    }
    const view: PatchViewReads = { places: () => places, plannedFolders: () => [], folderKey: (folder) => folder };
    const changes = buildPatchChanges(view, record);
    expect(changes.writes.map((item) => item.text)).toEqual(places.filter((place) => place.exists).map((place) => place.requested));
    expect(reads).toBe(1000);
  });

  it('tracks and reports many moves without repeatedly scanning chains', () => {
    const record: PatchRecord = { deletes: new Map(), writes: new Map(), moves: createMoveRegistry(), removedByDelete: new Set() };
    const places: PatchPlace[] = [];
    let reads = 0;
    record.moves.chains = new Proxy(record.moves.chains, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    for (let i = 0; i < 1000; i += 1) {
      const content: PatchContent = { realPath: `from-${i}`, original: undefined, mode: undefined, hadBom: false, current: String(i) };
      const from: PatchPlace = { requested: `from-${i}`, location: `from-${i}`, existed: true, exists: true, linkText: undefined, missingFolders: [], content };
      const to: PatchPlace = { requested: `to-${i}`, location: `to-${i}`, existed: false, exists: false, linkText: undefined, missingFolders: [], content };
      recordMove(record.moves, from, to, false);
      from.exists = false;
      to.exists = true;
      places.push(from, to);
      record.writes.set(content, { place: from, fromAdd: false });
    }
    expect(reads).toBeLessThan(3000);
    reads = 0;
    record.moves.chains = record.moves.chains.map((chain) => new Proxy(chain, {
      get(target, property, receiver) { reads += 1; return Reflect.get(target, property, receiver); },
    }));
    const view: PatchViewReads = { places: () => places, plannedFolders: () => [], folderKey: (folder) => folder };
    const changes = buildPatchChanges(view, record);
    const rows = patchRows(places, record.moves.chains);
    expect(changes.moves.map((move) => move.order)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    expect(changes.writes.map((write) => write.text)).toEqual(Array.from({ length: 1000 }, (_, i) => String(i)));
    expect(rows).toHaveLength(1000);
    expect(rows[999]).toEqual({ letter: 'R', path: 'from-999', target: 'to-999' });
    expect(reads).toBeLessThan(40_000);
  });

  it('selects the earliest chain when shared content returns to a place', () => {
    const content: PatchContent = { realPath: 'target', original: undefined, mode: undefined, hadBom: false, current: 'x' };
    const place = (name: string): PatchPlace => ({ requested: name, location: name, existed: true, exists: true, linkText: 'target', missingFolders: [], content });
    const [a, b, x, y, z] = ['a', 'b', 'x', 'y', 'z'].map((name) => place(name));
    const registry = createMoveRegistry();
    recordMove(registry, a, x, false);
    recordMove(registry, b, x, false);
    recordMove(registry, x, y, false);
    recordMove(registry, y, x, false);
    recordMove(registry, x, z, false);
    expect(registry.chains[0].hops.map((hop) => hop.to.requested)).toEqual(['x', 'y', 'x', 'z']);
    expect(registry.chains[1].hops.map((hop) => hop.to.requested)).toEqual(['x']);
  });
});
