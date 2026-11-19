import React from 'react';
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostRow } from '@shared/plugins/hosts/shared';
import type { TabPluginClientCapabilities } from '../api';
import { HostForm } from './HostForm';

const SAVED = { ok: true, name: 'saved' } as const;

function row(overrides: Partial<HostRow> = {}): HostRow {
  return {
    name: 'lab', user: 'admin', destination: 'devbox:2222', path: '/srv/ws',
    ...overrides,
  };
}

type Handler = (name: string, payload: unknown) => Promise<unknown>;

function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

function asIntent(handler: Handler): TabPluginClientCapabilities['intent'] {
  return async <Result,>(name: string, payload: unknown) => handler(name, payload) as Promise<Result>;
}

function form(options: { initial?: HostRow; intent?: Handler } = {}) {
  const handler = options.intent ?? vi.fn(async () => SAVED);
  const intent = asIntent(handler);
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <HostForm
      initial={options.initial}
      intent={intent}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { handler, intent, onSaved, onCancel, ...view };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('HostForm fields', () => {
  it('titles a new form and labels its four inputs in order with the right placeholders', () => {
    const { container } = form();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('New host');
    expect([...container.querySelectorAll(':scope .host-form label')].map((node) => node.textContent))
      .toEqual(['Name', 'User', 'Destination', 'Path']);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('User')).toHaveAttribute('placeholder', 'optional');
    expect(screen.getByLabelText('Destination')).toHaveAttribute('placeholder', 'host[:port]');
    expect(screen.getByLabelText('Path')).toHaveAttribute('placeholder', 'optional');
  });

  it('titles an edit form and prefills the selected row', () => {
    form({ initial: row() });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Edit host lab');
    expect(screen.getByLabelText('Name')).toHaveValue('lab');
    expect(screen.getByLabelText('User')).toHaveValue('admin');
    expect(screen.getByLabelText('Destination')).toHaveValue('devbox:2222');
    expect(screen.getByLabelText('Path')).toHaveValue('/srv/ws');
  });

  it('focuses Name after the dialog takes focus', () => {
    form();
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('traverses every field and button with Tab and wraps at both ends', () => {
    form();
    const stops = [
      screen.getByLabelText('Name'), screen.getByLabelText('User'),
      screen.getByLabelText('Destination'), screen.getByLabelText('Path'),
      screen.getByRole('button', { name: 'Save' }), screen.getByRole('button', { name: 'Cancel' }),
    ];
    expect(stops[0]).toHaveFocus();
    for (let at = 1; at < stops.length; at += 1) {
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(stops[at]).toHaveFocus();
    }
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(stops[0]).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(stops.at(-1)).toHaveFocus();
  });

  it('lets ordinary typing reach the focused field', () => {
    form();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'new name' } });
    expect(name).toHaveValue('new name');
  });
});

describe('HostForm submission', () => {
  it('sends all four fields with the original name for an edit on Save', async () => {
    const fixture = form({ initial: row() });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'lab2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fixture.handler).toHaveBeenCalledExactlyOnceWith('save', {
      name: 'lab2', user: 'admin', destination: 'devbox:2222', path: '/srv/ws', originalName: 'lab',
    }));
    expect(fixture.onSaved).toHaveBeenCalledWith('saved');
    expect(fixture.onCancel).not.toHaveBeenCalled();
  });

  it('sends no original name for a new host', async () => {
    const fixture = form();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'box' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fixture.handler).toHaveBeenCalledExactlyOnceWith('save', {
      name: 'new', user: '', destination: 'box', path: '',
    }));
  });

  it('leaves Enter in a field to native form submission', async () => {
    const fixture = form();
    const name = screen.getByLabelText('Name');
    const enter = createEvent.keyDown(name, { key: 'Enter' });
    fireEvent(name, enter);
    expect(enter.defaultPrevented).toBe(false);
    fireEvent.submit(name.closest('form')!);
    await waitFor(() => expect(fixture.handler).toHaveBeenCalledWith('save', expect.anything()));
  });

  it('dismisses without an intent on Cancel and on Escape', () => {
    const fixture = form();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.onCancel).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fixture.onCancel).toHaveBeenCalledTimes(2);
    expect(fixture.handler).not.toHaveBeenCalled();
  });

  it('disables Save, refuses cancellation and guards submission while pending', async () => {
    const pending = withResolvers<unknown>();
    const fixture = form({ intent: vi.fn(async () => pending.promise) });
    const { container } = fixture;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.handler).toHaveBeenCalledTimes(1);
    expect(fixture.onCancel).not.toHaveBeenCalled();

    pending.resolve(SAVED);
    await waitFor(() => expect(fixture.onSaved).toHaveBeenCalledWith('saved'));
  });

  it('shows a refused save above the buttons, re-enables Save and keeps the fields', async () => {
    const fixture = form({
      intent: vi.fn(async () => ({ ok: false, error: 'Host "lab" already exists.' })),
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'lab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Host "lab" already exists.')).toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('lab');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(fixture.onSaved).not.toHaveBeenCalled();
    expect(fixture.onCancel).not.toHaveBeenCalled();
  });

  it('shows the RPC error when the request is rejected', async () => {
    form({ intent: vi.fn(async () => { throw new Error('request refused'); }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('request refused')).toBeInTheDocument());
  });

  it('shows a fallback message when the reply is malformed', async () => {
    form({ intent: vi.fn(async () => ({ unexpected: true })) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Could not save host.')).toBeInTheDocument());
  });
});
