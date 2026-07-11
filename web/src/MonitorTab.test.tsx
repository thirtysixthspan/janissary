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

function renderTab(
  suggestions: SuggestionView[],
  handlers: { onRun?: (id: string) => void; onRate?: (id: string, up: boolean) => void; onReset?: () => void } = {},
  meta: { persona?: string; targets?: string; contextBytes?: number } = {},
) {
  return render(
    <MonitorTab
      persona={meta.persona ?? 'assistant'}
      targets={meta.targets ?? 'agent2'}
      contextBytes={meta.contextBytes ?? 0}
      suggestions={suggestions}
      onRun={handlers.onRun ?? vi.fn()}
      onRate={handlers.onRate ?? vi.fn()}
      onReset={handlers.onReset ?? vi.fn()}
    />,
  );
}

describe('MonitorTab', () => {
  it('shows an empty state when there are no suggestions', () => {
    renderTab([]);
    expect(screen.getByText(/No suggestions yet/)).toBeInTheDocument();
  });

  it('renders the persona and targets in the metadata line', () => {
    renderTab([], {}, { persona: 'security', targets: 'agent2, group:3' });
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('agent2, group:3')).toBeInTheDocument();
  });

  it.each([
    [0, '0b'],
    [999, '999b'],
    [1000, '1.0kb'],
    [45_000, '45.0kb'],
    [1_000_000, '1.0mb'],
    [2_500_000, '2.5mb'],
  ])('formats %i context bytes as %s', (bytes, expected) => {
    renderTab([], {}, { contextBytes: bytes });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders a reset-context button in the header', () => {
    renderTab([]);
    expect(screen.getByTitle('Reset context')).toBeInTheDocument();
  });

  it('clicking the reset button calls onReset', async () => {
    const onReset = vi.fn();
    renderTab([], { onReset });
    await userEvent.click(screen.getByTitle('Reset context'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders the suggestion text without per-row meta', () => {
    renderTab([makeSuggestion()]);
    const row = document.querySelector('.monitor-suggestion')!;
    expect(screen.getByText('You might want to check the build output')).toBeInTheDocument();
    expect(row.textContent).not.toContain('assistant');
    expect(row.textContent).not.toContain('agent2');
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
