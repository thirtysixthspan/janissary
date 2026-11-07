import { describe, expect, it, vi } from 'vitest';
import { disposeClosedPluginTabs, retainOpenDirtyPluginLabels } from './prune-closed-plugin-tabs';
import { PluginTabStateStore } from './tab-state-store';

describe('PluginTabStateStore', () => {
  it('keeps a tab state accessor stable and clears its values when the tab closes', () => {
    const store = new PluginTabStateStore();
    const imageState = store.forTab('image');
    imageState.set('image-edit', { operations: [{ kind: 'rotate', direction: 'right' }] });

    expect(store.forTab('image')).toBe(imageState);
    expect(store.forTab('image').get<{ operations: unknown[] }>('image-edit')).toEqual({
      operations: [{ kind: 'rotate', direction: 'right' }],
    });

    store.disposeClosedTabs(new Set(['shell']));

    expect(imageState.get('image-edit')).toBeUndefined();
    expect(store.forTab('image')).not.toBe(imageState);
    expect(store.forTab('image').get('image-edit')).toBeUndefined();
  });

  it('keeps state for every label that remains open', () => {
    const store = new PluginTabStateStore();
    const imageState = store.forTab('image');
    imageState.set('image-edit', { dirty: true });

    store.disposeClosedTabs(new Set(['image', 'notifications']));

    expect(store.forTab('image')).toBe(imageState);
    expect(store.forTab('image').get<{ dirty: boolean }>('image-edit')).toEqual({ dirty: true });
  });

  it('notifies active subscribers when values change and stops after disposal', () => {
    const store = new PluginTabStateStore();
    const imageState = store.forTab('image');
    const listener = vi.fn();
    const unsubscribe = imageState.subscribe?.(listener);

    imageState.set('image-edit', { dirty: true });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe?.();
    imageState.set('image-edit', { dirty: false });
    expect(listener).toHaveBeenCalledTimes(1);

    const closedListener = vi.fn();
    imageState.subscribe?.(closedListener);
    store.disposeClosedTabs(new Set());
    imageState.set('image-edit', { dirty: false });
    expect(closedListener).not.toHaveBeenCalled();
  });

  it('removes the dirty handle and marker when a tab label closes', () => {
    const store = new PluginTabStateStore();
    const imageState = store.forTab('image');
    imageState.set('image-edit', { dirty: true });
    const imageHandle = { isDirty: () => true, save: async () => {}, focus: () => {} };
    const handles = new Map([['image', imageHandle]]);

    const openLabels = new Set(['shell']);
    disposeClosedPluginTabs(openLabels, handles, store);
    const dirtyLabels = retainOpenDirtyPluginLabels(openLabels, new Set(['image']));

    expect(handles.has('image')).toBe(false);
    expect(dirtyLabels.has('image')).toBe(false);
    expect(imageState.get('image-edit')).toBeUndefined();
  });
});
