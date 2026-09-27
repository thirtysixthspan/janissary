import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView, TabView } from '@shared/protocol';
import { EditorTab } from './editor/EditorTab';
import { useSectionNav } from './useSectionNav';
import type { JanusClient } from './ws';

// The section-nav chord is registered app-wide in the capture phase, so an editor rendered on its
// own never meets it. These cases mount both, the way App does, to pin who gets Shift+Tab.

function makeView(): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1' };
}

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'editor', editor: makeView(), ...overrides,
  };
}

function makeClient(): JanusClient {
  const request = vi.fn().mockResolvedValue({ ok: true, value: { names: [], hunks: [] } });
  const readFile = vi.fn(async (url: string) => {
    const response = await fetch(url);
    return response.text();
  });
  return { saveFile: vi.fn(), editorSync: vi.fn(), request, send: vi.fn(), readFile } as unknown as JanusClient;
}

function Harness({ tabs, focusCenter }: { tabs: TabView[]; focusCenter: () => void }) {
  useSectionNav(tabs, focusCenter);
  const tab = tabs[0];
  return (
    <div className="app-center">
      <EditorTab editor={tab.editor!} tab={tab} client={makeClient()} active />
    </div>
  );
}

const rowText = (container: HTMLElement) => [
  ...container.querySelectorAll(':scope .editor-row:not(.editor-row-query) .editor-content'),
].map((row) => (row.textContent ?? '').replaceAll('\u{200B}', ''));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('  alpha\nbeta'),
  } as unknown as Response));
});

describe('Shift+Tab in an editor tab', () => {
  it('outdents the caret\'s line instead of cycling sections', async () => {
    const focusCenter = vi.fn();
    const { container } = render(<Harness tabs={[makeTab()]} focusCenter={focusCenter} />);
    await waitFor(() => expect(rowText(container)[0]).toBe('  alpha'));

    fireEvent.keyDown(screen.getByLabelText('Edit notes.txt'), { key: 'Tab', shiftKey: true });

    await waitFor(() => expect(rowText(container)[0]).toBe('alpha'));
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('still cycles sections from outside the editor\'s buffer', async () => {
    const focusCenter = vi.fn();
    const { container } = render(<Harness tabs={[makeTab()]} focusCenter={focusCenter} />);
    await waitFor(() => expect(rowText(container)[0]).toBe('  alpha'));

    fireEvent.keyDown(container.querySelector('.editor-meta')!, { key: 'Tab', shiftKey: true });

    expect(focusCenter).toHaveBeenCalledTimes(1);
    expect(rowText(container)[0]).toBe('  alpha');
  });
});
