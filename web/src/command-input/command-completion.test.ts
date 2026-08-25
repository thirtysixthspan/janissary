import { describe, it, expect, vi } from 'vitest';
import { handleTabCompletion } from './command-completion';

describe('handleTabCompletion', () => {
  it('clears completions and returns early when the token before the cursor is empty', () => {
    const complete = vi.fn();
    const setValue = vi.fn();
    const setCompletions = vi.fn();
    handleTabCompletion('', 0, complete, setValue, setCompletions, { current: null });
    expect(setCompletions).toHaveBeenCalledWith([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('clears completions when the cursor is at a whitespace boundary', () => {
    const complete = vi.fn();
    const setValue = vi.fn();
    const setCompletions = vi.fn();
    handleTabCompletion('open ', 5, complete, setValue, setCompletions, { current: null });
    expect(setCompletions).toHaveBeenCalledWith([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('calls complete with the current value and cursor when a token exists', () => {
    const rafStub = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafStub);
    const complete = vi.fn().mockResolvedValue({ newInput: 'files', newCursor: 5, matches: ['files'] });
    const setValue = vi.fn();
    const setCompletions = vi.fn();
    handleTabCompletion('fil', 3, complete, setValue, setCompletions, { current: null });
    expect(complete).toHaveBeenCalledWith('fil', 3);
    vi.unstubAllGlobals();
  });

  it('sets the provided value and clears dropdown after completion resolves', async () => {
    const rafStub = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafStub);
    const complete = vi.fn().mockResolvedValue({ newInput: 'files', newCursor: 5, matches: ['files'] });
    const setValue = vi.fn();
    const setCompletions = vi.fn();
    handleTabCompletion('fil', 3, complete, setValue, setCompletions, { current: null });
    await vi.waitFor(() => {
      expect(setValue).toHaveBeenCalledWith('files');
      expect(setCompletions).toHaveBeenCalledWith([]);
    });
    vi.unstubAllGlobals();
  });

  it('populates the completion dropdown when there are multiple matches', async () => {
    const rafStub = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafStub);
    const complete = vi.fn().mockResolvedValue({ newInput: 'op', newCursor: 2, matches: ['open', 'options'] });
    const setValue = vi.fn();
    const setCompletions = vi.fn();
    handleTabCompletion('o', 1, complete, setValue, setCompletions, { current: null });
    await vi.waitFor(() => {
      expect(setCompletions).toHaveBeenCalledWith(['open', 'options']);
    });
    vi.unstubAllGlobals();
  });

  it('sets cursor position via requestAnimationFrame after completion', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn());
    const input = { current: { selectionStart: 0, selectionEnd: 0 } as HTMLTextAreaElement };
    const complete = vi.fn().mockResolvedValue({ newInput: 'files', newCursor: 5, matches: ['files'] });
    handleTabCompletion('fil', 3, complete, vi.fn(), vi.fn(), input);
    await vi.waitFor(() => {
      expect(input.current!.selectionStart).toBe(5);
      expect(input.current!.selectionEnd).toBe(5);
    });
    vi.unstubAllGlobals();
  });
});
