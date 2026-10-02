import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MultiAgentMemberView, MultiAgentView } from '@shared/protocol';
import { MultiAgentTab } from './MultiAgentTab';

const member = (overrides: Partial<MultiAgentMemberView> = {}): MultiAgentMemberView => ({
  index: 0, model: 'opencode/big-pickle', state: 'running', ...overrides,
});

const view = (members: MultiAgentMemberView[], cloning = 0): MultiAgentView => ({
  prompt: 'what does this repository do?', members, cloning,
});

describe('MultiAgentTab', () => {
  it('shows the prompt once and a row per member', () => {
    render(<MultiAgentTab view={view([
      member({ index: 0 }),
      member({ index: 1, model: 'google/gemini' }),
    ])} />);

    expect(screen.getAllByText('what does this repository do?')).toHaveLength(1);
    expect(screen.getByText('opencode/big-pickle')).toBeDefined();
    expect(screen.getByText('google/gemini')).toBeDefined();
  });

  it('reads a working member as its state alone, with no answer block', () => {
    const { container } = render(<MultiAgentTab view={view([member({ state: 'running' })])} />);

    expect(screen.getByText('working')).toBeDefined();
    expect(container.querySelector('.multiagent-answer')).toBeNull();
  });

  it('reads a cloning member as cloning its workspace', () => {
    render(<MultiAgentTab view={view([member({ state: 'cloning' })], 1)} />);

    expect(screen.getByText('cloning its workspace')).toBeDefined();
    expect(screen.getByText('0 of 1 answered · 1 cloning')).toBeDefined();
  });

  it("renders an answered member's answer as markdown", () => {
    const { container } = render(<MultiAgentTab view={view([
      member({ state: 'answered', answer: '# Heading\n\nsome **bold** text' }),
    ])} />);

    const answer = container.querySelector('.multiagent-answer') as HTMLElement;
    expect(answer.querySelector(':scope > h1')?.textContent).toBe('Heading');
    expect(answer.querySelector(':scope strong')?.textContent).toBe('bold');
  });

  it('renders a failed member as its state and the reason, and no answer', () => {
    const { container } = render(<MultiAgentTab view={view([
      member({ state: 'failed', error: 'no origin remote' }),
    ])} />);

    expect(screen.getByText('failed')).toBeDefined();
    expect(screen.getByText('no origin remote')).toBeDefined();
    expect(container.querySelector('.multiagent-answer')).toBeNull();
  });

  it('leaves the answer out entirely when the member has none', () => {
    const { container } = render(<MultiAgentTab view={view([member({ state: 'failed' })])} />);

    expect(container.querySelector('.multiagent-error')).toBeNull();
    expect(container.querySelector('.multiagent-answer')).toBeNull();
  });

  it('leads with how many answered', () => {
    render(<MultiAgentTab view={view([
      member({ index: 0, state: 'answered', answer: 'a' }),
      member({ index: 1, model: 'b', state: 'answered', answer: 'b' }),
      member({ index: 2, model: 'c', state: 'running' }),
    ])} />);

    expect(screen.getByText('2 of 3 answered')).toBeDefined();
  });
});
