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

describe('MonitorTab', () => {
  it('shows an empty state when there are no suggestions', () => {
    render(<MonitorTab suggestions={[]} onRun={vi.fn()} />);
    expect(screen.getByText(/No suggestions yet/)).toBeInTheDocument();
  });

  it('renders the suggestion text without per-row meta', () => {
    render(<MonitorTab suggestions={[makeSuggestion()]} onRun={vi.fn()} />);
    expect(screen.getByText('You might want to check the build output')).toBeInTheDocument();
    expect(screen.queryByText(/assistant/)).not.toBeInTheDocument();
    expect(screen.queryByText(/agent2/)).not.toBeInTheDocument();
  });

  it('renders the newest suggestion first', () => {
    const older = makeSuggestion({ id: 'a', text: 'older suggestion' });
    const newer = makeSuggestion({ id: 'b', text: 'newer suggestion' });
    render(<MonitorTab suggestions={[older, newer]} onRun={vi.fn()} />);
    const texts = [...document.querySelectorAll('.monitor-suggestion')].map((n) => n.textContent);
    expect(texts[0]).toContain('newer suggestion');
    expect(texts[1]).toContain('older suggestion');
  });

  it('shows a clickable command only when the suggestion carries one', () => {
    const withCommand = makeSuggestion({ id: 'a', command: 'npm run build' });
    const withoutCommand = makeSuggestion({ id: 'b', text: 'Consider a break' });
    render(<MonitorTab suggestions={[withCommand, withoutCommand]} onRun={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'npm run build' })).toBeInTheDocument();
  });

  it('reports the suggestion id when its command is clicked', async () => {
    const onRun = vi.fn();
    const suggestion = makeSuggestion({ id: 'sug-42', command: 'npm test' });
    render(<MonitorTab suggestions={[suggestion]} onRun={onRun} />);
    await userEvent.click(screen.getByRole('button', { name: 'npm test' }));
    expect(onRun).toHaveBeenCalledWith('sug-42');
  });
});
