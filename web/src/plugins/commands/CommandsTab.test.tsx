import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CommandRow, CommandsPayload } from '@shared/plugins/commands/shared';
import type { TabPluginClientCapabilities } from '../api';
import { CommandsTab } from './CommandsTab';

function row(overrides: Partial<CommandRow> = {}): CommandRow {
  return {
    name: 'quit',
    label: 'quit',
    enabled: true,
    agentAccess: true,
    effectiveEnabled: true,
    effectiveAgentAccess: true,
    ...overrides,
  };
}

const ROWS: CommandRow[] = [
  row({ name: 'agent', label: 'agent' }),
  row({ name: 'ask', label: 'ask' }),
  row({ name: 'ask', label: 'ask reset', parent: 'ask' }),
  row({
    name: 'browser content', label: 'browser content', nativeTool: 'browser', parent: 'browser',
    effectiveAgentAccess: false,
  }),
  row({
    name: 'browser eval', label: 'browser eval', nativeTool: 'browser', parent: 'browser',
    enabled: false, effectiveEnabled: false, effectiveAgentAccess: false,
  }),
  row({ name: 'browser goto', label: 'browser goto', nativeTool: 'browser', parent: 'browser' }),
  row({ name: 'commands', label: 'commands' }),
  row({ name: 'db', label: 'db', enabled: false, effectiveEnabled: false }),
  row({
    name: 'db sqlite query', label: 'db sqlite query', nativeTool: 'database', parent: 'db',
    effectiveEnabled: false, effectiveAgentAccess: false,
  }),
  row({ name: 'quit', label: 'quit' }),
];

function makePayload(overrides: Partial<CommandsPayload> = {}): CommandsPayload {
  return {
    commands: ROWS,
    source: 'home',
    path: '/home/me/.janissary/commands.json',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function renderTab(
  payload: CommandsPayload = makePayload(),
  answer?: (name: string, value: unknown) => Promise<unknown>,
) {
  const intent = vi.fn<(name: string, value: unknown) => Promise<unknown>>(async (name, value) => {
    if (answer) return answer(name, value);
    return null;
  });
  const close = vi.fn();
  const capabilities = {
    resourceUrl: (reference: string) => reference,
    intent: async <Result,>(name: string, value: unknown) => intent(name, value) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock: null,
    close,
    reportFailure: vi.fn(),
  } as unknown as TabPluginClientCapabilities;
  const rendered = render(<CommandsTab payload={payload} capabilities={capabilities} />);
  const publish = (next: CommandsPayload) =>
    rendered.rerender(<CommandsTab payload={next} capabilities={capabilities} />);
  return { ...rendered, capabilities, close, intent, publish };
}

describe('CommandsTab rendering', () => {
  it('renders rows in payload order with an Enabled toggle for each and Agent access only on native rows', () => {
    renderTab();

    const enabled = screen.getAllByRole('checkbox', { name: /^Enabled: / });
    expect(enabled.map((checkbox) => checkbox.getAttribute('aria-label')))
      .toEqual(ROWS.map((entry) => `Enabled: ${entry.label}`));
    const agent = screen.getAllByRole('checkbox', { name: /^Agent access: / });
    expect(agent.map((checkbox) => checkbox.getAttribute('aria-label'))).toEqual([
      'Agent access: browser content',
      'Agent access: browser eval',
      'Agent access: browser goto',
      'Agent access: db sqlite query',
    ]);
    expect(screen.queryByLabelText('Agent access: agent')).not.toBeInTheDocument();
  });

  it('names the file in effect, shows its problem, and shows the empty message', () => {
    const { unmount } = renderTab(makePayload({ problem: 'commands.json is damaged.' }));
    expect(screen.getByText('Editing /home/me/.janissary/commands.json')).toBeInTheDocument();
    expect(screen.getByText('commands.json is damaged.')).toBeInTheDocument();
    unmount();

    renderTab(makePayload({ source: 'default', commands: [] }));
    expect(screen.getByText('No commands file in effect')).toBeInTheDocument();
    expect(screen.getByText('No commands')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('dims a parent-disabled row, disables both toggles, and names the parent', () => {
    renderTab();

    const enabled = screen.getByLabelText('Enabled: db sqlite query');
    const agent = screen.getByLabelText('Agent access: db sqlite query');
    expect(enabled).toBeChecked();
    expect(agent).toBeChecked();
    expect(enabled).toBeDisabled();
    expect(agent).toBeDisabled();
    const rowElement = enabled.closest('.commands-row');
    expect(rowElement).toHaveClass('commands-row-disabled');
    expect(within(rowElement as HTMLElement).getByText('Disabled by parent command: db.')).toBeInTheDocument();
  });

  it('keeps a self-disabled row\'s Enabled toggle interactive and disables Agent access', () => {
    renderTab();

    const enabled = screen.getByLabelText('Enabled: db');
    expect(enabled).not.toBeChecked();
    expect(enabled).toBeEnabled();
    expect(within(enabled.closest('.commands-row') as HTMLElement)
      .queryByText('Disabled by parent command: db.')).not.toBeInTheDocument();
  });

  it('locks both toggles of a saved-disabled child while its parent is disabled', () => {
    renderTab(makePayload({
      commands: [
        row({ name: 'browser', label: 'browser', enabled: false, effectiveEnabled: false }),
        row({
          name: 'browser eval', label: 'browser eval', nativeTool: 'browser', parent: 'browser',
          enabled: false, effectiveEnabled: false, effectiveAgentAccess: false,
        }),
      ],
    }));

    const enabled = screen.getByLabelText('Enabled: browser eval');
    expect(enabled).not.toBeChecked();
    expect(enabled).toBeDisabled();
    expect(screen.getByLabelText('Agent access: browser eval')).toBeDisabled();
    const rowElement = enabled.closest('.commands-row');
    expect(rowElement).toHaveClass('commands-row-disabled');
    expect(within(rowElement as HTMLElement).getByText('Disabled by parent command: browser.')).toBeInTheDocument();
  });

  it('disables Agent access without dimming when only a parent denies agent access', () => {
    renderTab();

    const enabled = screen.getByLabelText('Enabled: browser content');
    const agent = screen.getByLabelText('Agent access: browser content');
    expect(enabled).toBeEnabled();
    expect(agent).toBeDisabled();
    const rowElement = enabled.closest('.commands-row');
    expect(rowElement).not.toHaveClass('commands-row-disabled');
    expect(within(rowElement as HTMLElement).getByText('Disabled by parent command: browser.')).toBeInTheDocument();
  });
});

describe('CommandsTab controls', () => {
  it('sends set with the canonical name and setting without flipping the checkbox', () => {
    const { intent } = renderTab();
    const quit = screen.getByLabelText('Enabled: quit');

    fireEvent.click(quit);

    expect(intent).toHaveBeenCalledExactlyOnceWith('set', {
      name: 'quit', setting: 'enabled', value: false,
    });
    expect(quit).toBeChecked();

    fireEvent.click(screen.getByLabelText('Agent access: browser goto'));
    expect(intent).toHaveBeenLastCalledWith('set', {
      name: 'browser goto', setting: 'agentAccess', value: false,
    });
  });

  it('disables every row sharing the canonical setting while pending and leaves other controls usable', async () => {
    const pending = deferred<unknown>();
    const { intent } = renderTab(makePayload(), () => pending.promise);

    fireEvent.click(screen.getByLabelText('Enabled: ask'));

    expect(intent).toHaveBeenCalledExactlyOnceWith('set', {
      name: 'ask', setting: 'enabled', value: false,
    });
    expect(screen.getByLabelText('Enabled: ask')).toBeChecked();
    expect(screen.getByLabelText('Enabled: ask')).toBeDisabled();
    expect(screen.getByLabelText('Enabled: ask reset')).toBeDisabled();
    expect(screen.getByLabelText('Enabled: quit')).toBeEnabled();
    expect(screen.getByLabelText('Agent access: browser goto')).toBeEnabled();

    pending.resolve(null);
    await waitFor(() => {
      expect(screen.getByLabelText('Enabled: ask')).toBeEnabled();
      expect(screen.getByLabelText('Enabled: ask reset')).toBeEnabled();
    });
  });

  it('keeps the last successful value, shows the refusal, clears pending, and clears the refusal on the next toggle', async () => {
    let calls = 0;
    const { intent } = renderTab(makePayload(), async () => {
      calls += 1;
      if (calls === 1) throw new Error('Could not write commands.json at /home/me/.janissary/commands.json.');
      return null;
    });
    const quit = screen.getByLabelText('Enabled: quit');

    fireEvent.click(quit);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not write commands.json at /home/me/.janissary/commands.json.',
      );
    });
    expect(quit).toBeChecked();
    expect(quit).toBeEnabled();

    fireEvent.click(screen.getByLabelText('Enabled: agent'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => { expect(screen.getByLabelText('Enabled: agent')).toBeEnabled(); });
    expect(intent).toHaveBeenCalledTimes(2);
  });

  it('repaints a checked value from a successful publication', () => {
    const { publish } = renderTab();
    expect(screen.getByLabelText('Enabled: quit')).toBeChecked();

    publish(makePayload({
      commands: ROWS.map((entry) => (entry.name === 'quit' ? { ...entry, enabled: false } : entry)),
    }));

    expect(screen.getByLabelText('Enabled: quit')).not.toBeChecked();
  });

  it('repaints both form rows that share the ask canonical setting', () => {
    const { publish } = renderTab();
    expect(screen.getByLabelText('Enabled: ask')).toBeChecked();
    expect(screen.getByLabelText('Enabled: ask reset')).toBeChecked();

    publish(makePayload({
      commands: ROWS.map((entry) => (entry.name === 'ask' ? { ...entry, enabled: false } : entry)),
    }));

    expect(screen.getByLabelText('Enabled: ask')).not.toBeChecked();
    expect(screen.getByLabelText('Enabled: ask reset')).not.toBeChecked();
  });

  it('toggles a focused checkbox with Space through the native control', async () => {
    const user = userEvent.setup();
    const { intent } = renderTab();
    const quit = screen.getByLabelText('Enabled: quit');
    quit.focus();

    await user.keyboard(' ');

    expect(intent).toHaveBeenCalledWith('set', { name: 'quit', setting: 'enabled', value: false });
  });

  it('moves focus with Up and Down, skipping disabled rows and falling back to Enabled', () => {
    renderTab();
    const commands = screen.getByLabelText('Enabled: commands');
    commands.focus();

    expect(fireEvent.keyDown(commands, { key: 'ArrowDown' })).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('Enabled: db'));

    expect(fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('Enabled: quit'));

    const agent = screen.getByLabelText('Agent access: browser goto');
    agent.focus();
    fireEvent.keyDown(agent, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText('Enabled: commands'));
  });

  it('stops at the first and last rows without wrapping', () => {
    renderTab();
    const first = screen.getByLabelText('Enabled: agent');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);

    const last = screen.getByLabelText('Enabled: quit');
    last.focus();
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(last);
  });

  it('leaves Escape and other keys to the browser and host', () => {
    const { close, intent } = renderTab();
    const quit = screen.getByLabelText('Enabled: quit');

    expect(fireEvent.keyDown(quit, { key: 'Escape' })).toBe(true);
    expect(fireEvent.keyDown(quit, { key: 'Enter' })).toBe(true);
    expect(intent).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
