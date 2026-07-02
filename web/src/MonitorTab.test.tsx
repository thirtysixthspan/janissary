import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SuggestionView } from '@shared/protocol';
import { MonitorTab } from './MonitorTab';

function makeSuggestion(overrides: Partial<SuggestionView> = {}): SuggestionView {
  return {
    id: 's1',
    text: 'You might want to check the build output',
    timestamp: Date.now(),
    persona: 'assistant',
    about: 'agent2',
    ...overrides,
  };
}

function renderTab(suggestions: SuggestionView[], handlers: { onRun?: (id: string) => void; onRate?: (id: string, up: boolean) => void } = {}) {
  return render(
    <MonitorTab suggestions={suggestions} onRun={handlers.onRun ?? vi.fn()} onRate={handlers.onRate ?? vi.fn()} />,
  );
}

describe('MonitorTab', () => {
  it('shows an empty state when there are no suggestions', () => {
    renderTab([]);
    expect(screen.getByText(/No suggestions yet/)).toBeInTheDocument();
  });

  it('renders the suggestion text without per-row meta', () => {
    renderTab([makeSuggestion()]);
    expect(screen.getByText('You might want to check the build output')).toBeInTheDocument();
    expect(screen.queryByText(/assistant/)).not.toBeInTheDocument();
    expect(screen.queryByText(/agent2/)).not.toBeInTheDocument();
  });

  it('renders the newest suggestion first', () => {
    const older = makeSuggestion({ id: 'a', text: 'older suggestion' });
    const newer = makeSuggestion({ id: 'b', text: 'newer suggestion' });
    renderTab([older, newer]);
    const texts = [...document.querySelectorAll('.monitor-suggestion')].map((n) => n.textContent);
    expect(texts[0]).toContain('newer suggestion');
    expect(texts[1]).toContain('older suggestion');
  });

  it('shows a clickable command only when the suggestion carries one', () => {
    const withCommand = makeSuggestion({ id: 'a', command: 'npm run build' });
    const withoutCommand = makeSuggestion({ id: 'b', text: 'Consider a break' });
    renderTab([withCommand, withoutCommand]);
    expect(document.querySelectorAll('.cmd')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'npm run build' })).toBeInTheDocument();
  });

  it('reports the suggestion id when its command is clicked', async () => {
    const onRun = vi.fn();
    renderTab([makeSuggestion({ id: 'sug-42', command: 'npm test' })], { onRun });
    await userEvent.click(screen.getByRole('button', { name: 'npm test' }));
    expect(onRun).toHaveBeenCalledWith('sug-42');
  });

  it('shows rating buttons on every suggestion', () => {
    renderTab([makeSuggestion({ id: 'a' }), makeSuggestion({ id: 'b', text: 'other' })]);
    expect(screen.getAllByRole('button', { name: 'Helpful' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Not helpful' })).toHaveLength(2);
  });

  it('reports thumbs up and thumbs down with the suggestion id', async () => {
    const onRate = vi.fn();
    renderTab([makeSuggestion({ id: 'sug-7' })], { onRate });
    await userEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(onRate).toHaveBeenCalledWith('sug-7', true);
    await userEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    expect(onRate).toHaveBeenCalledWith('sug-7', false);
  });
});
