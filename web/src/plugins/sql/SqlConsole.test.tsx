import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SqlConsole } from './SqlConsole';
import { makeCapabilities } from './fixture';

// The console is the host's own command bar and nothing sits beside it. There is no history panel to
// open, so every key reaches the line, and the line's own recall walk is the only way back through
// what this tab has run.
function Console({ onSend }: { onSend(sql: string): void }) {
  const [value, setValue] = useState('');
  return (
    <SqlConsole
      active
      busy={false}
      value={value}
      onValue={setValue}
      onSend={onSend}
    />
  );
}

function shown() {
  const { intent } = makeCapabilities();
  render(<Console onSend={(sql) => intent('run', { sql })} />);
  return { intent };
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

  // With no panel to be modal over, Enter is the line's own key on every press — there is nothing
  // that can swallow the first one and leave the user pressing it again.
  it('runs on the first Enter, with nothing between it and the line', () => {
    const { intent } = shown();
    fireEvent.change(line(), { target: { value: 'DELETE FROM logs' } });
    press('Enter');
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('run', { sql: 'DELETE FROM logs' });
  });
});
