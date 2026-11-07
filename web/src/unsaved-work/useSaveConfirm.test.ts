import { act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSaveConfirm, type SaveConfirmRequest } from './useSaveConfirm';

type Attempt = { label: string; generation: number };
type HookRef = { current: ReturnType<typeof useSaveConfirm> };

function quitOf(request: SaveConfirmRequest | null) {
  if (request?.kind !== 'quit') throw new TypeError('expected a quit request');
  return request;
}

function closeOf(request: SaveConfirmRequest | null) {
  if (request?.kind !== 'close') throw new TypeError('expected a close request');
  return request;
}

function startAttempt(result: HookRef): Attempt {
  let attempt: Attempt | undefined;
  act(() => { attempt = result.current.startSave(); });
  if (!attempt) throw new Error('expected a save attempt');
  return attempt;
}

describe('useSaveConfirm', () => {
  it('starts with no request, no dialog, and no label', () => {
    const { result } = renderHook(() => useSaveConfirm());

    expect(result.current.request).toBeNull();
    expect(result.current.saveConfirmOpen).toBe(false);
    expect(result.current.labelRef.current).toBe('');
  });

  it('opens a close request for a label and replaces that label on a second open', () => {
    const { result } = renderHook(() => useSaveConfirm());

    act(() => { result.current.openClose('alpha'); });
    expect(closeOf(result.current.request)).toEqual({ kind: 'close', label: 'alpha' });
    expect(result.current.saveConfirmOpen).toBe(true);
    expect(result.current.labelRef.current).toBe('alpha');

    act(() => { result.current.openClose('beta'); });
    expect(closeOf(result.current.request)).toEqual({ kind: 'close', label: 'beta' });
    expect(result.current.labelRef.current).toBe('beta');
  });

  it('opens a quit walk with nothing answered and Save selected', () => {
    const { result } = renderHook(() => useSaveConfirm());

    act(() => { result.current.openQuitWalk('alpha'); });

    const request = quitOf(result.current.request);
    expect(request.label).toBe('alpha');
    expect(request.answered.size).toBe(0);
    expect(request.selection).toBe('save');
    expect(result.current.saveConfirmOpen).toBe(true);
    expect(result.current.labelRef.current).toBe('alpha');
  });

  it('advances to the next label, answering the previous one with the latest selection', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const advance = result.current.advanceQuitWalk;

    act(() => {
      result.current.select('discard');
      advance('beta');
    });

    const request = quitOf(result.current.request);
    expect(request.label).toBe('beta');
    expect([...request.answered]).toEqual(['alpha']);
    expect(request.answered.has('beta')).toBe(false);
    expect(request.selection).toBe('discard');
    expect(result.current.labelRef.current).toBe('beta');
  });

  it('does not mutate the answered set a previous request exposed', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const previous = quitOf(result.current.request).answered;

    act(() => { result.current.advanceQuitWalk('beta'); });

    const request = quitOf(result.current.request);
    expect(previous.size).toBe(0);
    expect(request.answered).not.toBe(previous);
    expect([...request.answered]).toEqual(['alpha']);
    expect(request.answered.has('beta')).toBe(false);
  });

  it('leaves the request and a pending attempt alone when advancing outside a quit walk', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openClose('alpha'); });
    const attempt = startAttempt(result);

    act(() => { result.current.advanceQuitWalk('beta'); });

    expect(closeOf(result.current.request).label).toBe('alpha');
    expect(result.current.labelRef.current).toBe('alpha');
    expect(result.current.saving).toBe(true);
    expect(result.current.isCurrentAttempt(attempt)).toBe(true);
    expect(result.current.startSave()).toBeUndefined();
  });

  it('leaves a missing request missing when advancing', () => {
    const { result } = renderHook(() => useSaveConfirm());

    act(() => { result.current.advanceQuitWalk('beta'); });

    expect(result.current.request).toBeNull();
    expect(result.current.saveConfirmOpen).toBe(false);
    expect(result.current.labelRef.current).toBe('');
  });

  it('changes the quit selection without touching the pending save or the generation', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const attempt = startAttempt(result);

    act(() => { result.current.select('cancel'); });

    expect(quitOf(result.current.request).selection).toBe('cancel');
    expect(result.current.saving).toBe(true);
    expect(result.current.isCurrentAttempt(attempt)).toBe(true);
    expect(result.current.startSave()).toBeUndefined();
    expect(result.current.labelRef.current).toBe('alpha');
  });

  it('ignores select with no request or on a close request', () => {
    const { result } = renderHook(() => useSaveConfirm());

    act(() => { result.current.select('cancel'); });
    expect(result.current.request).toBeNull();

    act(() => { result.current.openClose('alpha'); });
    act(() => { result.current.select('cancel'); });
    expect(closeOf(result.current.request)).toEqual({ kind: 'close', label: 'alpha' });
  });

  it('starts one save per request and returns the current label and generation', () => {
    const { result } = renderHook(() => useSaveConfirm());
    let absent: Attempt | undefined;
    act(() => { absent = result.current.startSave(); });
    expect(absent).toBeUndefined();

    act(() => { result.current.openQuitWalk('alpha'); });
    const first = startAttempt(result);
    expect(first.label).toBe('alpha');

    let repeated: Attempt | undefined;
    act(() => { repeated = result.current.startSave(); });
    expect(repeated).toBeUndefined();

    act(() => { result.current.advanceQuitWalk('beta'); });
    const second = startAttempt(result);
    expect(second.label).toBe('beta');
    expect(second.generation).toBeGreaterThan(first.generation);
  });

  it('reports an attempt as current only until the walk advances or the dialog is dismissed', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const advanced = startAttempt(result);
    expect(result.current.isCurrentAttempt(advanced)).toBe(true);

    act(() => { result.current.advanceQuitWalk('beta'); });
    expect(result.current.isCurrentAttempt(advanced)).toBe(false);

    const dismissed = startAttempt(result);
    expect(result.current.isCurrentAttempt(dismissed)).toBe(true);
    act(() => { result.current.dismiss(); });
    expect(result.current.isCurrentAttempt(dismissed)).toBe(false);
  });

  it('invalidates an attempt when a fresh close or quit request opens', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const walking = startAttempt(result);

    act(() => { result.current.openClose('beta'); });
    expect(result.current.isCurrentAttempt(walking)).toBe(false);

    const closing = startAttempt(result);
    expect(result.current.isCurrentAttempt(closing)).toBe(true);
    act(() => { result.current.openQuitWalk('gamma'); });
    expect(result.current.isCurrentAttempt(closing)).toBe(false);
  });

  it('dismisses the request and the saving flag but leaves the last label in place', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    startAttempt(result);
    expect(result.current.saving).toBe(true);

    act(() => { result.current.dismiss(); });

    expect(result.current.request).toBeNull();
    expect(result.current.saveConfirmOpen).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.labelRef.current).toBe('alpha');
  });

  it('starts a fresh close request after a walk without carrying walk state', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    act(() => { result.current.advanceQuitWalk('beta'); });
    act(() => { result.current.select('discard'); });

    act(() => { result.current.openClose('gamma'); });

    expect(result.current.request).toEqual({ kind: 'close', label: 'gamma' });
    expect(result.current.labelRef.current).toBe('gamma');
  });

  it('starts a later quit walk over after one is cancelled', () => {
    const { result } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    act(() => { result.current.advanceQuitWalk('beta'); });
    act(() => { result.current.select('discard'); });
    act(() => { result.current.dismiss(); });

    act(() => { result.current.openQuitWalk('gamma'); });

    const request = quitOf(result.current.request);
    expect(request.label).toBe('gamma');
    expect(request.answered.size).toBe(0);
    expect(request.selection).toBe('save');
  });

  it('invalidates a pending attempt when the hook unmounts', () => {
    const { result, unmount } = renderHook(() => useSaveConfirm());
    act(() => { result.current.openQuitWalk('alpha'); });
    const attempt = startAttempt(result);
    const isCurrentAttempt = result.current.isCurrentAttempt;
    expect(isCurrentAttempt(attempt)).toBe(true);

    unmount();

    expect(isCurrentAttempt(attempt)).toBe(false);
  });
});
