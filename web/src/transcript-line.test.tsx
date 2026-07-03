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

function makeMarkdownLine(text: string): BufferLine {
  return { type: 'markdown', text };
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

describe('renderLine — markdown link click', () => {
  it('sends an open command when an https link is clicked in markdown', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const line = makeMarkdownLine('Here is [a link](https://example.com) for you');
    render(<>{renderLine(line, 0, client, noop, vi.fn())}</>);
    await userEvent.click(screen.getByText('a link'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open https://example.com' } });
  });

  it('sends an edit command when a file:line link is clicked in markdown', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const line = makeMarkdownLine('Error in [src/foo.ts:42](src/foo.ts:42)');
    render(<>{renderLine(line, 0, client, noop, vi.fn())}</>);
    await userEvent.click(screen.getByText('src/foo.ts:42'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/foo.ts' } });
  });

  it('does not send a command when plain text without a link is clicked', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const line = makeMarkdownLine('Just some plain text with no link');
    render(<>{renderLine(line, 0, client, noop, vi.fn())}</>);
    await userEvent.click(screen.getByText('Just some plain text with no link'));
    expect(send).not.toHaveBeenCalled();
  });
});
