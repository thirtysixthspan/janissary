import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalFileSystemPort } from './filesystem-port.js';
import { freshFileNavigatorState } from './state.js';
import { applyViewSteps } from './restore-command.js';
import type { NavPort } from './navigation.js';
import type { ViewStep } from './view-args.js';

const roots: string[] = [];

function navigator() {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-command-restore-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'src', 'a.ts'), '');
  const state = freshFileNavigatorState(root, new LocalFileSystemPort());
  const port = {
    states: new Map([['files', state]]),
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    rebuild: vi.fn(),
    refreshGit: vi.fn(),
    reportFailure: vi.fn(),
    setCwd: vi.fn(),
    hasTab: () => true,
  } as unknown as NavPort;
  return { root, state, port };
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function apply(port: NavPort, steps: ViewStep[]): void {
  applyViewSteps(port, 'files', steps);
}

describe('applyViewSteps', () => {
  it('applies expansion, cursor, anchor, selection, and collapse in command order', () => {
    const { state, port } = navigator();

    apply(port, [
      { kind: 'expand', path: 'src' },
      { kind: 'cursor', path: 'src/a.ts' },
      { kind: 'anchor', path: 'src/a.ts' },
      { kind: 'select', path: 'src/a.ts' },
      { kind: 'collapse', path: 'src' },
    ]);

    expect(state.expanded).toEqual(new Set());
    expect(state.restore).toMatchObject({ cursor: 'src', anchor: 'src', selected: [] });
    expect(port.rebuild).toHaveBeenCalledTimes(1);
  });

  it('lets later expand and collapse clauses determine the final open state', () => {
    const first = navigator();
    apply(first.port, [{ kind: 'collapse', path: 'src' }, { kind: 'expand', path: 'src' }]);
    expect(first.state.expanded).toEqual(new Set(['src']));
    rmSync(first.root, { recursive: true, force: true });

    const second = navigator();
    apply(second.port, [{ kind: 'expand', path: 'src' }, { kind: 'collapse', path: 'src' }]);
    expect(second.state.expanded).toEqual(new Set());
    rmSync(second.root, { recursive: true, force: true });
  });

  it('drops a selection checked before its directory is expanded', () => {
    const { state, port } = navigator();

    apply(port, [{ kind: 'select', path: 'src/a.ts' }, { kind: 'expand', path: 'src' }]);

    expect(state.expanded).toEqual(new Set(['src']));
    expect(state.restore?.selected).toBeUndefined();
  });

  it('collapses all nested folders and the tree root', () => {
    const { state, port } = navigator();
    apply(port, [
      { kind: 'expand', path: 'src' },
      { kind: 'expand', path: 'src/deep' },
      { kind: 'expand', path: 'docs' },
      { kind: 'collapse', path: 'src' },
    ]);
    expect(state.expanded).toEqual(new Set(['docs']));

    apply(port, [{ kind: 'collapse', path: '' }]);

    expect(state.expanded).toEqual(new Set());
  });

  it('leaves entirely dropped parts absent and accumulates surviving selects', () => {
    const { state, port } = navigator();
    apply(port, [
      { kind: 'cursor', path: 'gone.ts' },
      { kind: 'select', path: 'gone.ts' },
      { kind: 'select', path: 'docs' },
      { kind: 'select', path: 'missing' },
    ]);

    expect(state.restore).not.toHaveProperty('cursor');
    expect(state.restore).toMatchObject({ selected: ['docs'] });
    rmSync(state.root, { recursive: true, force: true });

    const empty = navigator();
    apply(empty.port, [{ kind: 'select', path: 'gone.ts' }]);
    expect(empty.state.restore).not.toHaveProperty('selected');
    rmSync(empty.root, { recursive: true, force: true });
  });

  it('keeps an earlier cursor when a later cursor path is dropped', () => {
    const { state, port } = navigator();
    apply(port, [{ kind: 'cursor', path: 'docs' }, { kind: 'cursor', path: 'gone.ts' }]);
    expect(state.restore?.cursor).toBe('docs');
    rmSync(state.root, { recursive: true, force: true });
  });

  it('replaces a cursor with a later surviving cursor and adds each surviving select', () => {
    const { state, port } = navigator();
    apply(port, [
      { kind: 'cursor', path: 'docs' },
      { kind: 'cursor', path: 'src' },
      { kind: 'select', path: 'docs' },
      { kind: 'select', path: 'src' },
    ]);

    expect(state.restore).toMatchObject({ cursor: 'src', selected: ['docs', 'src'] });
    rmSync(state.root, { recursive: true, force: true });
  });
});
