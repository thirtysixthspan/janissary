import { describe, it, expect, vi } from 'vitest';
import { commitAfterSave, renameAndRefocus, sendResync } from './editor-file-commands';

describe('commitAfterSave', () => {
  it('arms the commit only after the save resolves, with a sync message naming the file', async () => {
    const order: string[] = [];
    const commitEditorFile = vi.fn(() => { order.push('commit'); });
    const save = vi.fn(async () => { await Promise.resolve(); order.push('save'); });
    await commitAfterSave({ commitEditorFile }, save, '/open/1', 'notes.txt');
    expect(order).toEqual(['save', 'commit']);
    expect(commitEditorFile).toHaveBeenCalledWith('/open/1', 'sync: notes.txt');
  });

  it('suppresses the commit and swallows the rejection when the save fails', async () => {
    const commitEditorFile = vi.fn();
    const save = vi.fn(() => Promise.reject(new Error('disk full')));
    await expect(commitAfterSave({ commitEditorFile }, save, '/open/1', 'notes.txt')).resolves.toBeUndefined();
    expect(commitEditorFile).not.toHaveBeenCalled();
  });
});

describe('renameAndRefocus', () => {
  it('sends the rename for the tab url and then returns focus to the buffer', () => {
    const order: string[] = [];
    const renameEditorFile = vi.fn(() => { order.push('rename'); });
    const focusBuffer = vi.fn(() => { order.push('focus'); });
    renameAndRefocus({ renameEditorFile }, '/open/1', 'plan.md', focusBuffer);
    expect(renameEditorFile).toHaveBeenCalledWith('/open/1', 'plan.md');
    expect(order).toEqual(['rename', 'focus']);
  });
});

describe('sendResync', () => {
  it('sends resyncEditorTab with the tab url', () => {
    const send = vi.fn();
    sendResync({ send }, '/open/1');
    expect(send).toHaveBeenCalledWith({ method: 'resyncEditorTab', params: { url: '/open/1' } });
  });
});
