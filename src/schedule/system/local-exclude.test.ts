import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureSystemScheduleExcluded, resetSystemScheduleExclusionCache } from './local-exclude.js';

const state = vi.hoisted(() => ({ calls: [] as string[][], exclude: '', tracked: false }));

vi.mock('node:child_process', () => ({
  execFileSync: (_file: string, args: string[], options: { cwd: string }) => {
    state.calls.push(args);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return options.cwd;
    if (args[0] === 'rev-parse') return '.git/info/exclude';
    if (args[0] === 'ls-files') return state.tracked ? args.at(-1) ?? '' : '';
    if (args[0] === 'check-ignore') {
      const target = args.at(-1) ?? '';
      if (state.exclude.split('\n').includes(`/${target}`)) return '';
      throw new Error('not ignored');
    }
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  },
}));

vi.mock('../../atomic-write.js', () => ({
  atomicWriteFile: (_file: string, contents: string) => { state.exclude = contents; },
}));

let roots: string[] = [];

beforeEach(() => {
  state.calls = [];
  state.exclude = '';
  state.tracked = false;
  roots = [];
  resetSystemScheduleExclusionCache();
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-exclude-'));
  roots.push(root);
  return root;
}

describe('ensureSystemScheduleExcluded cache', () => {
  it('does not repeat Git checks after a root is successfully excluded', () => {
    const root = projectRoot();

    ensureSystemScheduleExcluded(root);
    const successfulCalls = state.calls.length;
    ensureSystemScheduleExcluded(root);

    expect(successfulCalls).toBeGreaterThan(0);
    expect(state.calls).toHaveLength(successfulCalls);
  });

  it('retries a root after a failed exclusion check', () => {
    const root = projectRoot();
    state.tracked = true;

    expect(() => ensureSystemScheduleExcluded(root)).toThrow(/tracked by Git/);
    state.tracked = false;
    ensureSystemScheduleExcluded(root);

    expect(state.calls.filter((args) => args[0] === 'rev-parse' && args[1] === '--show-toplevel')).toHaveLength(2);
  });
});
