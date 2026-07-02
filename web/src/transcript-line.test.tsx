import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { renderLine } from './transcript-line';

function makePromptLine(overrides: Partial<BufferLine> = {}): BufferLine {
  return {
    type: 'prompt',
    text: 'git status',
    ...overrides,
  };
}

const clientStub = {} as JanusClient;
const noop = () => {};

describe('renderLine — prompt click', () => {
  it('calls onPromptClick with the line text when a plain prompt is clicked', async () => {
    const onPromptClick = vi.fn();
    const line = makePromptLine({ text: 'git status', cwd: '/home/user' });
    render(<>{renderLine(line, 0, clientStub, noop, onPromptClick)}</>);
    await userEvent.click(screen.getByText(/git status/));
    expect(onPromptClick).toHaveBeenCalledWith('git status');
  });

  it('calls onToggleCollapse and not onPromptClick when an ACP prompt is clicked', async () => {
    const onPromptClick = vi.fn();
    const onToggleCollapse = vi.fn();
    const line = makePromptLine({ text: 'agent step', acp: true });
    render(<>{renderLine(line, 0, clientStub, onToggleCollapse, onPromptClick)}</>);
    await userEvent.click(screen.getByText(/agent step/));
    expect(onToggleCollapse).toHaveBeenCalled();
    expect(onPromptClick).not.toHaveBeenCalled();
  });

  it('does not call onPromptClick when text is selected', async () => {
    const onPromptClick = vi.fn();
    const line = makePromptLine({ text: 'git status' });
    const spy = vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'git' } as Selection);
    render(<>{renderLine(line, 0, clientStub, noop, onPromptClick)}</>);
    await userEvent.click(screen.getByText(/git status/));
    expect(onPromptClick).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
