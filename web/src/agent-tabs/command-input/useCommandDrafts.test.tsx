import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { useCommandDraft, useCommandDrafts, type CommandDrafts } from './useCommandDrafts';

function makeTab(label: string): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
  };
}

// A stand-in for the command bar: shows one key's draft and exposes the writer to the test.
let write: ((next: string) => void) | null = null;

function Draft({ draftKey, drafts }: { draftKey: string; drafts: CommandDrafts }) {
  const { value, setValue } = useCommandDraft(draftKey, drafts);
  write = setValue;
  return <span data-testid="draft">{value}</span>;
}

// A stand-in for the app shell: owns the store for a tab list and hands it to the test.
function Store({ tabs, onStore }: { tabs: TabView[]; onStore: (drafts: CommandDrafts) => void }) {
  onStore(useCommandDrafts(tabs));
  return null;
}

describe('useCommandDraft', () => {
  it('starts empty for a key with no draft', () => {
    render(<Draft draftKey="janus" drafts={new Map()} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('');
  });

  it('starts from the stored draft for its key', () => {
    render(<Draft draftKey="willow" drafts={new Map([['willow', 'git status']])} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('git status');
  });

  it('writes each edit through to the store', () => {
    const drafts: CommandDrafts = new Map();
    render(<Draft draftKey="willow" drafts={drafts} />);
    act(() => { write?.('half-typed'); });
    expect(drafts.get('willow')).toBe('half-typed');
  });

  it('removes the entry rather than storing an empty draft', () => {
    const drafts: CommandDrafts = new Map([['willow', 'git status']]);
    render(<Draft draftKey="willow" drafts={drafts} />);
    act(() => { write?.(''); });
    expect(drafts.has('willow')).toBe(false);
  });

  it('swaps in the other key’s draft when the key changes, and back again', () => {
    const drafts: CommandDrafts = new Map([['cedar', 'ls -la']]);
    const { rerender } = render(<Draft draftKey="willow" drafts={drafts} />);
    act(() => { write?.('git status'); });
    rerender(<Draft draftKey="cedar" drafts={drafts} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('ls -la');
    rerender(<Draft draftKey="willow" drafts={drafts} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('git status');
  });

  it('shows an empty draft for a key that has none, without disturbing the stored one', () => {
    const drafts: CommandDrafts = new Map();
    const { rerender } = render(<Draft draftKey="willow" drafts={drafts} />);
    act(() => { write?.('git status'); });
    rerender(<Draft draftKey="cedar" drafts={drafts} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('');
    expect(drafts.get('willow')).toBe('git status');
  });

  it('restores the draft after an unmount and remount', () => {
    const drafts: CommandDrafts = new Map();
    const { unmount } = render(<Draft draftKey="willow" drafts={drafts} />);
    act(() => { write?.('git status'); });
    unmount();
    render(<Draft draftKey="willow" drafts={drafts} />);
    expect(screen.getByTestId('draft')).toHaveTextContent('git status');
  });
});

describe('useCommandDrafts', () => {
  it('returns the same store across renders', () => {
    const seen: CommandDrafts[] = [];
    const tabs = [makeTab('janus')];
    const { rerender } = render(<Store tabs={tabs} onStore={(d) => { seen.push(d); }} />);
    rerender(<Store tabs={[...tabs]} onStore={(d) => { seen.push(d); }} />);
    expect(seen.at(-1)).toBe(seen[0]);
  });

  it('drops the draft of a tab that is no longer open, keeping the rest', () => {
    const seen: CommandDrafts[] = [];
    const onStore = (d: CommandDrafts) => { seen.push(d); };
    const { rerender } = render(<Store tabs={[makeTab('janus'), makeTab('willow')]} onStore={onStore} />);
    seen[0].set('janus', 'still open');
    seen[0].set('willow', 'about to close');
    rerender(<Store tabs={[makeTab('janus')]} onStore={onStore} />);
    expect(seen[0].get('janus')).toBe('still open');
    expect(seen[0].has('willow')).toBe(false);
  });
});
