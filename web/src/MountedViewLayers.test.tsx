import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MountedViewLayers } from './MountedViewLayers';

function makeEditorTab(label: string, url: string) {
  return {
    label, view: 'editor' as const, dotColor: '#0f0', groupColor: '#ccc',
    editor: { url, name: 'test.ts' },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  };
}

describe('MountedViewLayers', () => {
  it('renders editor tabs', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')] as never[];
    const harnessHandles = React.createRef<Map<string, unknown>>();
    harnessHandles.current = new Map();
    const editorHandles = React.createRef<Map<string, unknown>>();
    editorHandles.current = new Map();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: tabs[0], client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeTruthy();
  });

  it('hides editor tab when not current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')] as never[];
    const other = { ...tabs[0], label: 'other' };
    const harnessHandles = React.createRef<Map<string, unknown>>();
    harnessHandles.current = new Map();
    const editorHandles = React.createRef<Map<string, unknown>>();
    editorHandles.current = new Map();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs, current: other as never, client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    const el = container.querySelector('.tab-body') as HTMLElement;
    expect(el.style.display).toBe('none');
  });

  it('renders editor tab as flex when current', () => {
    const tabs = [makeEditorTab('etab', '/test.ts')] as never[];
    const harnessHandles = React.createRef<Map<string, unknown>>();
    harnessHandles.current = new Map();
    const editorHandles = React.createRef<Map<string, unknown>>();
    editorHandles.current = new Map();
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
    const harnessHandles = React.createRef<Map<string, unknown>>();
    harnessHandles.current = new Map();
    const editorHandles = React.createRef<Map<string, unknown>>();
    editorHandles.current = new Map();
    const { container } = render(
      React.createElement(MountedViewLayers, {
        tabs: [{ label: 'a', view: 'editor', dotColor: '#0f0', groupColor: '#ccc' }] as never[],
        current: { label: 'a' } as never,
        client: { send: vi.fn() } as never,
        harnessHandles, editorHandles,
      }),
    );
    expect(container.querySelector('.tab-body')).toBeNull();
  });
});
