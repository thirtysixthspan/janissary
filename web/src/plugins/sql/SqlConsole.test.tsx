import React, { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SqlConsole } from './SqlConsole';
import { makeCapabilities } from './fixture';

// The console is the host's own command bar and nothing sits beside it. Its keys are its own: a bare
// `Tab` leaves for the grid, and a held modifier is the host's.
function Console({ onSend, onLeave }: { onSend(sql: string): Promise<boolean>; onLeave(): void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <SqlConsole
      active
      busy={false}
      inputRef={inputRef}
      value={value}
      onValue={setValue}
      onSend={onSend}
      onLeave={onLeave}
    />
  );
}

function shown(onSend?: (sql: string) => Promise<boolean>) {
  const { intent } = makeCapabilities();
  const onLeave = vi.fn();
  render(<Console
    onSend={onSend ?? (async (sql) => { await intent('run', { sql }); return true; })}
    onLeave={onLeave}
  />);
  return { intent, onLeave };
}

const line = () => screen.getByLabelText('SQL') as HTMLTextAreaElement;
const press = (key: string) => fireEvent.keyDown(line(), { key });

function deferred<T>() {
  let resolve!: (value: T) => void;
  // The web project's ES2023 library does not include Promise.withResolvers.
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

describe('the SQL command bar', () => {
  it('prompts with the word SQL, so a bare chevron is not read as the application command line', () => {
    shown();
    expect(screen.getByText('SQL')).toBeTruthy();
  });

  it('sends what is typed on Enter', () => {
    const { intent } = shown();
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    press('Enter');
    expect(intent).toHaveBeenCalledWith('run', { sql: 'SELECT 1' });
  });

  it('offers no control beside the line, so the bar is the only place a statement is entered', () => {
    shown();
    expect(screen.queryByLabelText('Statement history')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // The recall walk is what is left of the history: the last fifty statements typed in this tab,
  // reached from the line itself.
  it('walks back through what it has already run', async () => {
    shown();
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    press('Enter');
    await waitFor(() => expect(line().value).toBe(''));
    press('ArrowUp');
    expect(line().value).toBe('SELECT 1');
  });

  it('keeps a rejected statement in the line and out of history', async () => {
    const pending = deferred<boolean>();
    const onSend = vi.fn(() => pending.promise);
    shown(onSend);
    fireEvent.change(line(), { target: { value: 'UPDATE orders SET status = \'paid\'' } });
    press('Enter');
    pending.resolve(false);
    await waitFor(() => expect(line().value).toBe('UPDATE orders SET status = \'paid\''));

    fireEvent.change(line(), { target: { value: 'draft after rejection' } });
    press('ArrowUp');

    expect(line().value).toBe('draft after rejection');
  });

  it('prevents duplicate submits and keeps newer typing when an older request is accepted', async () => {
    const pending = deferred<boolean>();
    const onSend = vi.fn(() => pending.promise);
    shown(onSend);
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    press('Enter');
    press('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.change(line(), { target: { value: 'newer draft' } });
    pending.resolve(true);
    await waitFor(() => expect(line().value).toBe('newer draft'));
    press('ArrowUp');
    expect(line().value).toBe('SELECT 1');
  });

  it('keeps Shift+Enter as a newline instead of submitting', () => {
    const onSend = vi.fn(async () => true);
    shown(onSend);
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    fireEvent.keyDown(line(), { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(line().value).toContain('\n');
  });

  // The tab has two panes, and this is how a user crosses to the other one. The frame above owns
  // both, so all the bar can say is that it is leaving. `fireEvent` answers `false` for a keypress
  // something claimed, which is the same question asked the other way round.
  it('hands focus to the grid on a bare Tab', () => {
    const { onLeave } = shown();
    expect(fireEvent.keyDown(line(), { key: 'Tab' })).toBe(false);
    expect(onLeave).toHaveBeenCalledOnce();
  });

  // Shift+Tab walks out of a plugin tab, and Ctrl+Tab is the host's too. Neither is this key's, so
  // neither may be swallowed here.
  it('leaves a held Tab to the application', () => {
    const { onLeave } = shown();
    expect(fireEvent.keyDown(line(), { key: 'Tab', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(line(), { key: 'Tab', ctrlKey: true })).toBe(true);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
