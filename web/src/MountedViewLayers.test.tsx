import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { EditorTabHandle } from './EditorTab';
import { MountedViewLayers } from './MountedViewLayers';

vi.mock('./HarnessTab', () => {
  const { forwardRef, useImperativeHandle, createElement } = React;
  return {
    HarnessTab: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return createElement('div', { 'data-testid': 'harness' });
    }),
  };
});

function makeEditorTab(label: string, url: string): TabView {
  return {
    label, view: 'editor' as const, dotColor: '#0f0', groupColor: '#ccc',
    editor: { url, name: 'test.ts' },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function makeHarnessTab(label: string, ptyId: string): TabView {
  return {
    label, view: 'harness' as const, dotColor: '#f00', groupColor: '#ccc',
    harness: { ptyId, name: 'shell' },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    activePty: undefined,
  } as unknown as TabView;
}

function makeHarnessHandles() {
  const ref = React.createRef<Map<string, HarnessTabHandle>>();
  (ref as { current: Map<string, HarnessTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, HarnessTabHandle>>;
}

function makeEditorHandles() {
  const ref = React.createRef<Map<string, EditorTabHandle>>();
  (ref as { current: Map<string, EditorTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, EditorTabHandle>>;
}

describe('MountedViewLayers', () => {
  it('renders editor tabs', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides editor tab when not current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const other = makeEditorTab('other', '/other.ts');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders editor tab as flex when current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out tabs without editor payload', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'editor', dotColor: '#0f0', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });

  it('renders harness tabs', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides harness tab when not current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const other = makeHarnessTab('other', 'pty2');
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other, client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders harness tab as flex when current', () => {
    const tabs = [makeHarnessTab('htab', 'pty1')];
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('flex');
  });

  it('filters out tabs without harness payload', () => {
    const harnessHandles = makeHarnessHandles();
    const editorHandles = makeEditorHandles();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'harness', dotColor: '#f00', groupColor: '#ccc' }] as TabView[],
        current: { label: 'a' } as TabView,
        client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });
});
