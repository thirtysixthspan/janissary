import { render } from '@testing-library/react';
import React, { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ShellTab, type ShellTabHandle } from './ShellTab';
import type { JanusClient } from './ws';

vi.mock('./useXterm', () => ({
  useXterm: vi.fn(() => () => {}),
}));

import { useXterm } from './useXterm';

const mockedUseXterm = useXterm as ReturnType<typeof vi.fn>;

function fakeClient(): JanusClient {
  return { send: vi.fn() } as unknown as JanusClient;
}

describe('ShellTab', () => {
  it('renders harness-tab and harness-body divs', () => {
    const client = fakeClient();
    const { container } = render(<ShellTab ptyId="pty1" client={client} />);
    expect(container.querySelector('.harness-tab')).toBeInTheDocument();
    expect(container.querySelector('.harness-body')).toBeInTheDocument();
  });

  it('passes ptyId and client to useXterm', () => {
    const client = fakeClient();
    mockedUseXterm.mockClear();
    render(<ShellTab ptyId="my-pty" client={client} />);
    const opts = mockedUseXterm.mock.calls[0][0];
    expect(opts.ptyId).toBe('my-pty');
    expect(opts.client).toBe(client);
  });

  it('passes a keyFilter that blocks shift+arrow keys and allows other keys', () => {
    const client = fakeClient();
    mockedUseXterm.mockClear();
    render(<ShellTab ptyId="pty1" client={client} />);
    const opts = mockedUseXterm.mock.calls[0][0];
    const filter = opts.keyFilter as (e: KeyboardEvent) => boolean;

    expect(filter(new KeyboardEvent('keyup', { key: 'a' }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: 'a' }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, ctrlKey: true }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))).toBe(true);
  });

  it('passes a keyFilter that blocks Cmd+Shift+[/] and allows plain Cmd+[/]', () => {
    const client = fakeClient();
    mockedUseXterm.mockClear();
    render(<ShellTab ptyId="pty1" client={client} />);
    const opts = mockedUseXterm.mock.calls[0][0];
    const filter = opts.keyFilter as (e: KeyboardEvent) => boolean;

    expect(filter(new KeyboardEvent('keydown', { key: '[', metaKey: true, shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: ']', metaKey: true, shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: '{', metaKey: true, shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: '}', metaKey: true, shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: '[', metaKey: true }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: ']', metaKey: true }))).toBe(true);
  });

  it('calls term.focus() on mount', () => {
    const focus = vi.fn();
    mockedUseXterm.mockImplementationOnce(({ onMount }: { onMount?: (term: { focus: () => void }) => void }) => {
      onMount?.({ focus });
      return () => {};
    });
    const client = fakeClient();
    render(<ShellTab ptyId="pty1" client={client} />);
    expect(focus).toHaveBeenCalled();
  });

  it('exposes focus that delegates to useXterm focus', () => {
    const focusXterm = vi.fn();
    mockedUseXterm.mockImplementationOnce(() => focusXterm);
    const ref = createRef<ShellTabHandle>();
    const client = fakeClient();
    render(<ShellTab ptyId="pty1" client={client} ref={ref} />);
    ref.current?.focus();
    expect(focusXterm).toHaveBeenCalled();
  });

  it('shows the given cwd in the metadata row', () => {
    const client = fakeClient();
    const { getByText } = render(<ShellTab ptyId="pty1" client={client} cwd="~/project" />);
    expect(getByText('~/project')).toBeInTheDocument();
  });

  it('renders the workspaced emoji with a tooltip when flags includes workspaced', () => {
    const client = fakeClient();
    const { getByRole } = render(<ShellTab ptyId="pty1" client={client} flags={['workspaced']} />);
    const badge = getByRole('img', { name: 'Workspaced' });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('📦');
    expect(badge).toHaveAttribute('title', 'Workspaced');
  });

  it('renders no flag emoji when flags is empty', () => {
    const client = fakeClient();
    const { container } = render(<ShellTab ptyId="pty1" client={client} flags={[]} />);
    expect(container.querySelectorAll('.tab-flag').length).toBe(0);
  });

  it('renders both flag emoji when both are present', () => {
    const client = fakeClient();
    const { getByRole } = render(<ShellTab ptyId="pty1" client={client} flags={['workspaced', 'autoApprove']} />);
    expect(getByRole('img', { name: 'Workspaced' })).toBeInTheDocument();
    expect(getByRole('img', { name: 'Auto-permitting' })).toBeInTheDocument();
  });
});
