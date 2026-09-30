import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SqlConsole } from './SqlConsole';
import { makeCapabilities } from './fixture';

// The console is the host's own command bar and nothing sits beside it. Its keys are its own: a bare
// `Tab` leaves for the grid, and a held modifier is the host's.
function Console({ onSend, onLeave }: { onSend(sql: string): void; onLeave(): void }) {
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

function shown() {
  const { intent } = makeCapabilities();
  const onLeave = vi.fn();
  render(<Console onSend={(sql) => intent('run', { sql })} onLeave={onLeave} />);
  return { intent, onLeave };
}

const line = () => screen.getByLabelText('SQL') as HTMLTextAreaElement;
const press = (key: string) => fireEvent.keyDown(line(), { key });

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
  it('walks back through what it has already run', () => {
    shown();
    fireEvent.change(line(), { target: { value: 'SELECT 1' } });
    press('Enter');
    press('ArrowUp');
    expect(line().value).toBe('SELECT 1');
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
