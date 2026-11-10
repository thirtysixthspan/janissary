import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replayMutation, type MutationContext } from './mutations.js';
import { freshFileNavigatorState } from '../state.js';
import type { HistoryStep } from '../moves.js';

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function setup(isWriting = false): {
  context: MutationContext; root: string; retarget: ReturnType<typeof vi.fn>;
  push: (stack: 'undoStack' | 'redoStack', step: HistoryStep) => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'janissary-mutations-'));
  roots.push(root);
  const retarget = vi.fn();
  const state = freshFileNavigatorState(root, undefined as never);
  state.filesystem = undefined;
  const managers = { tab: { retargetEditorTab: retarget }, shellTranscript: { isWriting: () => isWriting } };
  const context = { managers, tabs: new Map([['files', state]]), rebuild: vi.fn() } as unknown as MutationContext;
  return { context, root, retarget, push: (stack, step) => { state[stack].push(step); } };
}

describe('replayMutation', () => {
  it('notifies pathsMoved with the reversed pairs after undoing a cut paste', () => {
    const { context, root, retarget, push } = setup();
    mkdirSync(path.join(root, 'dest'));
    const from = path.join(root, 'a.txt');
    const to = path.join(root, 'dest', 'a.txt');
    writeFileSync(to, 'x');
    push('undoStack', { mode: 'cut', pairs: [{ from, to }] });

    replayMutation(context, 'files', 'undo', false, false);

    expect(retarget).toHaveBeenCalledWith(to, from);
  });

  it('notifies pathsMoved with the recorded pairs after redoing a move', () => {
    const { context, root, retarget, push } = setup();
    writeFileSync(path.join(root, 'a.txt'), 'x');
    push('redoStack', { entries: [{ from: 'a.txt', to: 'b.txt' }] });

    replayMutation(context, 'files', 'redo', false, false);

    expect(retarget).toHaveBeenCalledWith(path.join(root, 'a.txt'), path.join(root, 'b.txt'));
  });

  it('refuses without moving when the source is a live transcript', () => {
    const { context, root, retarget, push } = setup(true);
    writeFileSync(path.join(root, 'b.txt'), 'x');
    push('undoStack', { entries: [{ from: 'a.txt', to: 'b.txt' }] });

    const result = replayMutation(context, 'files', 'undo', false, false);

    expect(result).toMatchObject({ total: 1, failedPaths: ['b.txt'] });
    expect(retarget).not.toHaveBeenCalled();
  });

  it('does not notify for a copy paste', () => {
    const { context, root, retarget, push } = setup();
    const from = path.join(root, 'a.txt');
    const to = path.join(root, 'c.txt');
    writeFileSync(from, 'x');
    push('redoStack', { mode: 'copy', pairs: [{ from, to }] });

    replayMutation(context, 'files', 'redo', false, false);

    expect(retarget).not.toHaveBeenCalled();
  });
});
