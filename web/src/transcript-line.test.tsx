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

const ESC = String.fromCodePoint(27);

const clientStub = {} as JanusClient;
const noop = () => {};

describe('renderLine — prompt click', () => {
  it('calls onPromptClick with the line text when a plain prompt is double-clicked', async () => {
    const onPromptClick = vi.fn();
    const line = makePromptLine({ text: 'git status', cwd: '/home/user' });
    render(<>{renderLine(line, 0, clientStub, noop, onPromptClick)}</>);
    await userEvent.dblClick(screen.getByText(/git status/));
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
    await userEvent.dblClick(screen.getByText(/git status/));
    expect(onPromptClick).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not call onPromptClick when the cwd text is double-clicked, only the command text', async () => {
    const onPromptClick = vi.fn();
    const line = makePromptLine({ text: 'git status', cwd: '/home/user' });
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, onPromptClick)}</>);
    await userEvent.dblClick(screen.getByText('/home/user'));
    expect(onPromptClick).not.toHaveBeenCalled();
    expect(container.querySelector('.cwd')).not.toHaveClass('prompt-text');
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
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/foo.ts:42' } });
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

describe('renderLine — ansi output', () => {
  it('renders a styled span for an SGR-colored substring in a plain output line', () => {
    const line: BufferLine = { type: 'output', text: `plain ${ESC}[32mgreen${ESC}[0m plain` };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    const styled = container.querySelector('.ansi-fg-2');
    expect(styled).toBeInTheDocument();
    expect(styled?.textContent).toBe('green');
    expect(container.querySelector('.line')?.textContent).toBe('plain green plain');
  });

  it('still renders a clickable file-link inside a colored output line', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const line: BufferLine = { type: 'output', text: `${ESC}[31msrc/foo.ts:42${ESC}[0m` };
    render(<>{renderLine(line, 0, client, noop, vi.fn())}</>);
    await userEvent.click(screen.getByText('src/foo.ts:42'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/foo.ts:42' } });
  });

  it('renders a styled span for a running line with ansi codes', () => {
    const line: BufferLine = { type: 'output', running: true, text: `${ESC}[33myellow${ESC}[0m` };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    expect(container.querySelector('.ansi-fg-3')?.textContent).toBe('yellow');
  });

  it('renders a styled span for an acp line with ansi codes', () => {
    const line: BufferLine = { type: 'output', acp: true, text: `${ESC}[36mcyan${ESC}[0m` };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    expect(container.querySelector('.ansi-fg-6')?.textContent).toBe('cyan');
  });

  it('gives priority to the search hit over ansi styling', () => {
    const line: BufferLine = { type: 'output', text: `${ESC}[32man error occurred${ESC}[0m` };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn(), { lineIndex: 0, pattern: 'error' })}</>);
    expect(container.querySelector('.search-hit')).toBeInTheDocument();
  });

  it('leaves plain output without ansi codes unaffected', () => {
    const line: BufferLine = { type: 'output', text: 'just plain text' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    expect(container.querySelector('[class*="ansi-"]')).toBeNull();
    expect(container.querySelector('.line')?.textContent).toBe('just plain text');
  });
});

describe('renderLine — search highlight', () => {
  it('wraps only the matched substring on the current match line', () => {
    const line: BufferLine = { type: 'output', text: 'an error occurred' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn(), { lineIndex: 0, pattern: 'error' })}</>);
    const hit = container.querySelector('.search-hit');
    expect(hit).toBeInTheDocument();
    expect(hit?.textContent).toBe('error');
    expect(container.querySelector('.line')?.textContent).toBe('an error occurred');
  });

  it('does not highlight a line other than the current match', () => {
    const line: BufferLine = { type: 'output', text: 'an error occurred' };
    const { container } = render(<>{renderLine(line, 1, clientStub, noop, vi.fn(), { lineIndex: 0, pattern: 'error' })}</>);
    expect(container.querySelector('.search-hit')).not.toBeInTheDocument();
  });

  it('applies the search-hit class to the whole block for a markdown match (fallback)', () => {
    const line = makeMarkdownLine('an error occurred');
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn(), { lineIndex: 0, pattern: 'error' })}</>);
    const el = container.querySelector('.line.markdown');
    expect(el).toHaveClass('search-hit');
  });

  it('sets data-search-hit on the current match line for scroll targeting', () => {
    const line: BufferLine = { type: 'output', text: 'an error occurred' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn(), { lineIndex: 0, pattern: 'error' })}</>);
    expect(container.querySelector('[data-search-hit]')).toBeInTheDocument();
  });
});

describe('renderLine — message openFile link', () => {
  it('renders a clickable link that sends an edit command when the message carries openFile', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude', openFile: '/captures/claude-now.txt' };
    const { container } = render(<>{renderLine(line, 0, client, noop, vi.fn())}</>);
    const link = container.querySelector('.file-link[role="link"]')!;
    expect(link).toBeInTheDocument();
    await userEvent.click(link);
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /captures/claude-now.txt' } });
  });

  it('renders the capture link as an icon, not text', () => {
    const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude', openFile: '/captures/claude-now.txt' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    const link = container.querySelector('.file-link[role="link"]')!;
    expect(link).toHaveAttribute('aria-label', 'View capture');
    expect(link.textContent?.trim()).not.toMatch(/view capture/i);
  });

  it('renders the capture link as a clipboard icon', () => {
    const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude', openFile: '/captures/claude-now.txt' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    const link = container.querySelector('.file-link[role="link"]')!;
    expect(link.querySelector('svg[data-icon]')).toHaveAttribute('data-icon', 'clipboard');
  });

  it('renders no link when the message has no openFile', () => {
    const line: BufferLine = { type: 'message', text: 'a plain notification', from: '8:32pm janus' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    expect(container.querySelector('[role="link"]')).toBeNull();
  });

  it('exposes the notifying tab color as a CSS variable, not by coloring the whole line', () => {
    const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude', fromColor: '#ff0000' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    const lineEl = container.querySelector('.line.message') as HTMLElement;
    expect(lineEl.style.getPropertyValue('--from-color')).toBe('#ff0000');
    expect(lineEl.style.color).toBe('');
  });

  it('splits the from string into a time and a tab pill', () => {
    const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude' };
    const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
    expect(container.querySelector('.message-time')?.textContent).toBe('8:32pm');
    expect(container.querySelector('.message-tab')?.textContent).toBe('claude');
  });
});
