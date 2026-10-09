import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LauncherCommand, LauncherPayload, LauncherTabRow } from '@shared/plugins/launcher/shared';
import type { TabPluginClientCapabilities } from '../api';
import { AppCommandBarProvider, AppCommandBarTabScope } from '../../shared/command-bar/AppCommandBar';
import { LauncherTab } from './LauncherTab';

function capabilities(dock: TabPluginClientCapabilities['dock'] = 'left') {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function command(overrides: Partial<LauncherCommand> = {}): LauncherCommand {
  return { id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks', ...overrides };
}

function row(label: string, overrides: Partial<LauncherTabRow> = {}): LauncherTabRow {
  return {
    label, busy: false, hasUnread: false, needsInput: false,
    lastActivity: Date.now() - 60_000, cwd: '/repo', ...overrides,
  };
}

function payload(overrides: Partial<LauncherPayload> = {}): LauncherPayload {
  return {
    commands: [command()],
    tabs: [],
    summaries: {},
    source: 'project',
    filePath: '/repo/.janissary/launcher.json',
    ...overrides,
  };
}

function launcher(value = payload(), caps = capabilities()) {
  // The launcher hosts the application's own command bar, so the bar's provider has to be above it. A
  // spy for `intercept` rather than a no-op, so a case can tell whether a line was answered by the
  // application at all.
  const intercept = vi.fn<(line: string) => boolean>(() => false);
  return {
    ...render(
      <AppCommandBarProvider bar={{
        intercept,
        ghostHistory: [],
        blockingOverlayOpen: false,
        overlayOwnsCommandBar: false,
        queueOpen: false,
        queueIndex: 0,
        queueItems: [],
        queuedLinesOf: () => [],
        registerCommandLineInsertion: () => () => {},
      }}>
        <AppCommandBarTabScope label="launcher">
          <LauncherTab payload={value} capabilities={caps.value} />
        </AppCommandBarTabScope>
      </AppCommandBarProvider>,
    ),
    intercept,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('the command rail', () => {
  it("shows every configured command with the user's own label", () => {
    launcher(payload({
      commands: [
        command({ id: 'tasks', label: 'My tasks', command: 'tasks' }),
        command({ id: 'notifications', icon: 'faBell', label: 'Alerts', command: 'notifications left' }),
      ],
    }));

    expect(screen.getByRole('option', { name: /My tasks/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Alerts/ })).toBeInTheDocument();
  });

  it('dispatches the line the entry resolves to when a command is clicked twice', () => {
    // The second click on an already-highlighted row is the one that runs it, so a rail does not fire
    // while the user is still reading down the list.
    const caps = capabilities();
    launcher(payload({ commands: [command()] }), caps);

    const entry = screen.getByRole('option', { name: /Tasks/ });
    fireEvent.click(entry);
    fireEvent.click(entry);

    expect(caps.intent).toHaveBeenCalledWith('run-command', { id: 'tasks' });
  });

  it('runs the highlighted command on Enter', () => {
    const caps = capabilities();
    launcher(payload({ commands: [command()] }), caps);

    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Launch commands' }), { key: 'Enter' });

    expect(caps.intent).toHaveBeenCalledWith('run-command', { id: 'tasks' });
  });

  it('moves the selection down the rail on ArrowDown, stopping at the end', () => {
    const caps = capabilities();
    launcher(payload({
      commands: [command({ id: 'tasks' }), command({ id: 'search', label: 'Search', command: 'search' })],
    }), caps);
    const rail = screen.getByRole('listbox', { name: 'Launch commands' });

    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    fireEvent.keyDown(rail, { key: 'Enter' });

    expect(caps.intent).toHaveBeenCalledWith('run-command', { id: 'search' });
  });

  it('opens the file in effect when the Configure button is pressed', () => {
    const caps = capabilities();
    launcher(payload(), caps);

    fireEvent.click(screen.getByRole('button', { name: 'Open launcher.json' }));

    expect(caps.intent).toHaveBeenCalledWith('configure', { id: 'configure' });
  });
});

describe('the tab list', () => {
  it('draws the tiers in order, each labelled, and no tier nothing is in', () => {
    launcher(payload({
      tabs: [
        row('busy-one', { busy: true }),
        row('unread-one', { hasUnread: true }),
        row('idle-one'),
      ],
    }));

    const tiers = screen.getByRole('listbox', { name: 'Open tabs' }).querySelectorAll<HTMLElement>('.launcher-tier');
    expect([...tiers].map((tier) => tier.dataset.tier)).toEqual(['unread', 'busy', 'idle']);
    expect([...tiers].map((tier) => tier.querySelector('.launcher-tier-label')?.textContent))
      .toEqual(['Unread', 'Working', 'Idle']);
  });

  // A docked tab never reaches this view at all — the host drops it from the payload, because the rule
  // is a property of what a row can do and belongs in the one place that decides. What the client
  // promises is that it renders the rows the host gave it, and nothing more.
  it('renders the rows the host gave it, docked or not', () => {
    launcher(payload({
      tabs: [row('centre'), row('docked', { dock: 'left' })],
    }));

    expect(screen.getByText('centre')).toBeInTheDocument();
    expect(screen.getByText('docked')).toBeInTheDocument();
  });

  it('focuses the row that was clicked twice', () => {
    const caps = capabilities();
    launcher(payload({ tabs: [row('shell')] }), caps);

    const entry = screen.getByRole('option', { name: /shell/ });
    fireEvent.click(entry);
    fireEvent.click(entry);

    expect(caps.intent).toHaveBeenCalledWith('focus-tab', { label: 'shell' });
  });

  it('shows the status paragraph when a tab has one, and nothing when it does not', () => {
    launcher(payload({
      tabs: [row('shell'), row('quiet')],
      summaries: { shell: 'Running the test suite.' },
    }));

    expect(screen.getByText('Running the test suite.')).toBeInTheDocument();
    expect(screen.queryByText('', { selector: '.launcher-summary' })).not.toBeInTheDocument();
  });

  it('says the rail is empty when nothing is open', () => {
    launcher(payload({ tabs: [] }));

    expect(screen.getByText('No open tabs')).toBeInTheDocument();
  });
});

describe('the hover card', () => {
  it('opens over a row the pointer enters, carrying what the row has no width for', () => {
    launcher(payload({
      tabs: [row('agent', { title: 'Release agent', cwd: '/repo/ws', remote: 'devbox', lastCommand: 'npm test' })],
    }));

    fireEvent.mouseEnter(screen.getByRole('option', { name: /Release agent/ }));

    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('/repo/ws');
    expect(card).toHaveTextContent('devbox');
    expect(card).toHaveTextContent('npm test');
  });

  it('closes when the pointer leaves', () => {
    launcher(payload({ tabs: [row('shell')] }));
    const entry = screen.getByRole('option', { name: /shell/ });

    fireEvent.mouseEnter(entry);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(entry);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('the rail as a docked view', () => {
  it('says it is reading the user\'s own file when one is in effect', () => {
    launcher(payload({ source: 'home', filePath: '/Users/me/.janissary/launcher.json' }));

    expect(screen.getByTitle('/Users/me/.janissary/launcher.json')).toBeInTheDocument();
  });

  it('says the file is in trouble rather than hiding it', () => {
    launcher(payload({ problem: 'launcher.json is not valid JSON at /repo/.janissary/launcher.json' }));

    expect(screen.getByTitle('launcher.json is not valid JSON at /repo/.janissary/launcher.json'))
      .toBeInTheDocument();
  });
});
