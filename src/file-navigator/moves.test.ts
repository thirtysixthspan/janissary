import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyStackPaste, type HistoryStep, type PasteGroup } from './moves.js';
import { fileIdentity } from './file-identity.js';
import type { PastePair } from './paste.js';

let roots: string[] = [];

function temporaryRoot(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-moves-'));
  roots.push(created);
  return created;
}

function pair(root: string, name: string): PastePair {
  return { from: path.join(root, name), to: path.join(root, 'dest', name) };
}

function stacks(group: PasteGroup): { from: HistoryStep[]; to: HistoryStep[] } {
  return { from: [group], to: [] };
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('applyStackPaste', () => {
  it('returns plural conflicts without changing files or stacks', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const pairs = [pair(root, 'a.txt'), pair(root, 'b.txt')];
    for (const current of pairs) {
      writeFileSync(current.from, 'blocked');
      writeFileSync(current.to, 'moved');
    }
    const group: PasteGroup = { mode: 'cut', pairs };
    const history = stacks(group);
    const rebuild = vi.fn();

    const result = applyStackPaste(group, 'undo', history.from, history.to, undefined, rebuild);

    expect(result).toEqual({
      total: 2,
      failedPaths: [],
      conflicts: pairs.map((current) => ({ fromRelPath: current.from, toRelPath: current.to })),
    });
    expect(history).toEqual({ from: [group], to: [] });
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('skips conflicts and retains the skipped pair for retry', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const conflict = pair(root, 'a.txt');
    const replayed = pair(root, 'b.txt');
    writeFileSync(conflict.from, 'blocked');
    writeFileSync(conflict.to, 'moved a');
    writeFileSync(replayed.to, 'moved b');
    const group: PasteGroup = { mode: 'cut', pairs: [conflict, replayed] };
    const history = stacks(group);
    const rebuild = vi.fn();

    const result = applyStackPaste(group, 'undo', history.from, history.to, 'skip-conflicts', rebuild);

    expect(result).toEqual({ total: 2, failedPaths: [] });
    expect(readFileSync(replayed.from, 'utf8')).toBe('moved b');
    expect(readFileSync(conflict.from, 'utf8')).toBe('blocked');
    expect(history.from).toEqual([{ mode: 'cut', pairs: [conflict] }]);
    expect(history.to).toEqual([{ mode: 'cut', pairs: [replayed] }]);
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it('overwrites every conflict and moves the whole group', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const pairs = [pair(root, 'a.txt'), pair(root, 'b.txt')];
    for (const current of pairs) {
      writeFileSync(current.from, 'blocked');
      writeFileSync(current.to, `moved ${path.basename(current.to)}`);
    }
    const group: PasteGroup = { mode: 'cut', pairs };
    const history = stacks(group);
    const rebuild = vi.fn();

    const result = applyStackPaste(group, 'undo', history.from, history.to, 'overwrite-all', rebuild);

    expect(result).toEqual({ total: 2, failedPaths: [] });
    for (const current of pairs) {
      expect(readFileSync(current.from, 'utf8')).toBe(`moved ${path.basename(current.to)}`);
      expect(existsSync(current.to)).toBe(false);
    }
    expect(history).toEqual({ from: [], to: [group] });
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it('undoes a copied directory recursively', () => {
    const root = temporaryRoot();
    const current = pair(root, 'folder');
    mkdirSync(path.join(current.to, 'nested'), { recursive: true });
    writeFileSync(path.join(current.to, 'nested', 'file.txt'), 'copied');
    current.identity = fileIdentity(current.to);
    const group: PasteGroup = { mode: 'copy', pairs: [current] };
    const history = stacks(group);
    const rebuild = vi.fn();

    expect(applyStackPaste(group, 'undo', history.from, history.to, undefined, rebuild))
      .toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(current.to)).toBe(false);
    expect(history).toEqual({ from: [], to: [group] });
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it('surfaces a conflict and preserves an edited copy destination', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    writeFileSync(copied.from, 'original');
    writeFileSync(copied.to, 'original');
    copied.identity = fileIdentity(copied.to);
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);
    const rebuild = vi.fn();
    writeFileSync(copied.to, 'user edit');

    expect(applyStackPaste(group, 'undo', history.from, history.to, undefined, rebuild))
      .toEqual({ total: 1, failedPaths: [], conflict: { fromRelPath: copied.from, toRelPath: copied.to } });
    expect(readFileSync(copied.to, 'utf8')).toBe('user edit');
    expect(history.to).toEqual([]);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('detects edits inside copied directories', () => {
    const root = temporaryRoot();
    const copied = pair(root, 'folder');
    mkdirSync(path.join(copied.from, 'nested'), { recursive: true });
    mkdirSync(path.join(copied.to, 'nested'), { recursive: true });
    writeFileSync(path.join(copied.from, 'nested', 'file.txt'), 'source');
    writeFileSync(path.join(copied.to, 'nested', 'file.txt'), 'copied');
    copied.identity = fileIdentity(copied.to);
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);
    writeFileSync(path.join(copied.to, 'nested', 'file.txt'), 'user edit');

    expect(applyStackPaste(group, 'undo', history.from, history.to, undefined, vi.fn()))
      .toMatchObject({ conflict: { fromRelPath: copied.from, toRelPath: copied.to } });
    expect(readFileSync(path.join(copied.to, 'nested', 'file.txt'), 'utf8')).toBe('user edit');
  });

  it('detects a replacement even when the new file has identical contents', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    const replacement = path.join(root, 'replacement.txt');
    writeFileSync(copied.from, 'source');
    writeFileSync(copied.to, 'same bytes');
    copied.identity = fileIdentity(copied.to);
    writeFileSync(replacement, 'same bytes');
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);
    rmSync(copied.to);
    renameSync(replacement, copied.to);

    expect(applyStackPaste(group, 'undo', history.from, history.to, undefined, vi.fn()))
      .toMatchObject({ conflict: { fromRelPath: copied.from, toRelPath: copied.to } });
    expect(readFileSync(copied.to, 'utf8')).toBe('same bytes');
  });

  it('keeps an edited copy on skip and removes it only after explicit overwrite', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    writeFileSync(copied.from, 'original');
    writeFileSync(copied.to, 'original');
    copied.identity = fileIdentity(copied.to);
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);
    writeFileSync(copied.to, 'newer content');

    expect(applyStackPaste(group, 'undo', history.from, history.to, 'skip-conflicts', vi.fn()))
      .toEqual({ total: 1, failedPaths: [] });
    expect(readFileSync(copied.to, 'utf8')).toBe('newer content');
    expect(history.from).toEqual([group]);

    expect(applyStackPaste(group, 'undo', history.from, history.to, 'overwrite-all', vi.fn()))
      .toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(copied.to)).toBe(false);
  });

  it('treats legacy copy history without an identity as a conflict when the output exists', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    writeFileSync(copied.to, 'possibly edited');
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);

    expect(applyStackPaste(group, 'undo', history.from, history.to, undefined, vi.fn()))
      .toMatchObject({ conflict: { fromRelPath: copied.from, toRelPath: copied.to } });
    expect(readFileSync(copied.to, 'utf8')).toBe('possibly edited');
  });

  it('refreshes the recorded identity when redo creates a new copy', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    writeFileSync(copied.from, 'source');
    writeFileSync(copied.to, 'old copy');
    copied.identity = fileIdentity(copied.to);
    const group: PasteGroup = { mode: 'copy', pairs: [copied] };
    const history = stacks(group);
    expect(applyStackPaste(group, 'undo', history.from, history.to, 'overwrite-all', vi.fn()))
      .toEqual({ total: 1, failedPaths: [] });
    expect(applyStackPaste(group, 'redo', history.to, history.from, undefined, vi.fn()))
      .toEqual({ total: 1, failedPaths: [] });
    expect(history.from[0]).toMatchObject({
      mode: 'copy', pairs: [{ identity: fileIdentity(copied.to) }],
    });
  });

  it('retains a failed redo pair and pushes only the successful pair', () => {
    const root = temporaryRoot();
    mkdirSync(path.join(root, 'dest'));
    const copied = pair(root, 'a.txt');
    const missing = pair(root, 'b.txt');
    writeFileSync(copied.from, 'a');
    const group: PasteGroup = { mode: 'copy', pairs: [copied, missing] };
    const history = stacks(group);
    const rebuild = vi.fn();

    const result = applyStackPaste(group, 'redo', history.from, history.to, undefined, rebuild);

    expect(result).toMatchObject({ total: 2, failedPaths: [missing.to] });
    expect(result.failureReasons?.[missing.to]).toContain('no longer exists');
    expect(readFileSync(copied.to, 'utf8')).toBe('a');
    expect(history.from).toEqual([{ mode: 'copy', pairs: [missing] }]);
    expect(history.to).toEqual([{ mode: 'copy', pairs: [copied] }]);
    expect(rebuild).toHaveBeenCalledOnce();
  });
});
