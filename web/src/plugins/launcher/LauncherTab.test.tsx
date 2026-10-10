import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
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
    label, dotColor: '#5b9cff', active: false, busy: false, hasUnread: false, needsInput: false,
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

function bar(intercept: (line: string) => boolean) {
  return {
    intercept,
    ghostHistory: [],
    blockingOverlayOpen: false,
    overlayOwnsCommandBar: false,
    queueOpen: false,
    queueIndex: 0,
    queueItems: [],
    queuedLinesOf: () => [],
    registerCommandLineInsertion: () => () => {},
  };
}

function launcher(value = payload(), caps = capabilities()) {
  // The launcher hosts the application's own command bar, so the bar's provider has to be above it. A
  // spy for `intercept` rather than a no-op, so a case can tell whether a line was answered by the
  // application at all.
  const intercept = vi.fn<(line: string) => boolean>(() => false);
  return {
    ...render(
      <AppCommandBarProvider bar={bar(intercept)}>
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

  // `tasks` and `hist` — the launcher's own default rows — are the application's pickers. The client
  // classifies them, so a click on a row naming one opens the picker and sends nothing to the server,
  // exactly as typing the same word into the bar below would.
  it.each(['tasks', 'hist'])('opens the application\'s own picker for %s, sending nothing', (line) => {
    const caps = capabilities();
    const { intercept } = launcher(payload({
      commands: [command({ id: line, label: line, command: line })],
    }), caps);
    intercept.mockReturnValue(true);

    const row = screen.getByRole('option', { name: new RegExp(line, 'i') });
    fireEvent.click(row);
    fireEvent.click(row);

    // The application answered it, as whatever tab the line came from — which is this one.
    expect(intercept.mock.calls.map(([asked]) => asked)).toEqual([line]);
    expect(caps.intent).not.toHaveBeenCalled();
  });

  // The rail sends the id the host validated against launcher.json, never the command line, so the
  // host's own read of the file stays the thing that decides what may run.
  it('sends the id the host validated, never the command line', async () => {
    const caps = capabilities();
    launcher(payload({ commands: [command()] }), caps);

    const row = screen.getByRole('option', { name: /Tasks/ });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(caps.intent).toHaveBeenCalledWith('run-command', { id: 'tasks' });
    expect(caps.intent.mock.calls.map(([, sent]) => sent)).not.toContainEqual({ line: 'tasks' });
  });

  // A row whose command nothing claims was silent, because the intent's answer was discarded. It now
  // says so, which is what the bar directly below it already did.
  it('reports a configured command the application did not claim', async () => {
    const caps = capabilities();
    caps.intent.mockResolvedValue({ dispatched: false, output: '' });
    launcher(payload({ commands: [command()] }), caps);

    const row = screen.getByRole('option', { name: /Tasks/ });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(await screen.findByText('No application command matches "tasks".')).toBeInTheDocument();
  });

  it('shows what a configured command produced', async () => {
    const caps = capabilities();
    caps.intent.mockResolvedValue({ dispatched: true, output: 'Opened the task list.' });
    launcher(payload({ commands: [command()] }), caps);

    const row = screen.getByRole('option', { name: /Tasks/ });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(await screen.findByText('Opened the task list.')).toBeInTheDocument();
  });

  // An id the file no longer holds answers `null` — the host's own validation. Showing it as unclaimed
  // keeps a row that stale from looking like it worked.
  it('reports a row the host no longer resolves as unclaimed', async () => {
    const caps = capabilities();
    caps.intent.mockResolvedValue(null);
    launcher(payload({ commands: [command()] }), caps);

    const row = screen.getByRole('option', { name: /Tasks/ });
    fireEvent.click(row);
    fireEvent.click(row);

    expect(await screen.findByText('No application command matches "tasks".')).toBeInTheDocument();
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

  // One bad icon name costs one glyph and one notification, not the command it belongs to — and a
  // repaint is not a second notification.
  it('reports an icon this build cannot draw, once per name', () => {
    const caps = capabilities();
    const { rerender } = launcher(payload({
      commands: [
        command({ id: 'tasks', icon: 'faNotAGlyph', label: 'Tasks' }),
        command({ id: 'search', icon: 'faAlsoMissing', label: 'Search' }),
      ],
    }), caps);

    fireEvent.click(screen.getByRole('option', { name: /Tasks/ }));

    // Each unrecognised name is reported once, and two names are two reports.
    const reported = caps.intent.mock.calls.filter(([name]) => name === 'report-icon');
    expect(reported).toEqual([
      ['report-icon', { icon: 'faNotAGlyph' }],
      ['report-icon', { icon: 'faAlsoMissing' }],
    ]);

    // A repaint of the same rail reports nothing new.
    caps.intent.mockClear();
    rerender(
      <AppCommandBarProvider bar={{
        intercept: () => false,
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
          <LauncherTab payload={payload({ commands: [command({ icon: 'faNotAGlyph', label: 'Tasks' })] })} capabilities={caps.value} />
        </AppCommandBarTabScope>
      </AppCommandBarProvider>,
    );

    expect(caps.intent.mock.calls.filter(([name]) => name === 'report-icon')).toEqual([]);
  });
});

describe('the tab list', () => {
  it('draws the tiers in order, each labelled, and no tier nothing is in', () => {
    launcher(payload({
      tabs: [
        row('busy-one', { busy: true }),
        row('unread-one', { hasUnread: true }),
        row('idle-one'),
        row('here', { active: true }),
      ],
    }));

    const tiers = screen.getByRole('listbox', { name: 'Open tabs' }).querySelectorAll<HTMLElement>('.launcher-tier');
    expect([...tiers].map((tier) => tier.dataset.tier)).toEqual(['unread', 'active', 'busy', 'idle']);
    expect([...tiers].map((tier) => tier.querySelector('.launcher-tier-label')?.textContent))
      .toEqual(['Unread', 'Active', 'Working', 'Idle']);
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

  // The keyboard walks the rows in the order they are drawn, which is tier order. The payload's own
  // order is not that order, so an index into it would light the second row on screen and act on the
  // row the highlight is not on.
  it('highlights the first row drawn, whichever row the payload names first', () => {
    launcher(payload({
      tabs: [row('quiet', { busy: false }), row('badged', { hasUnread: true })],
    }));

    const drawn = [...screen.getByRole('listbox', { name: 'Open tabs' })
      .querySelectorAll<HTMLElement>('.launcher-tab-row')];
    expect(drawn.map((el) => el.dataset.label)).toEqual(['badged', 'quiet']);
    // Both rows number themselves by where they were drawn, not by where the payload had them.
    expect(drawn.map((el) => el.dataset.index)).toEqual(['0', '1']);
    expect(drawn[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('moves the highlight along the drawn rows, and acts on the highlighted one', () => {
    const caps = capabilities();
    launcher(payload({
      tabs: [row('quiet', { busy: false }), row('badged', { hasUnread: true })],
    }), caps);
    const list = screen.getByRole('listbox', { name: 'Open tabs' });

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });

    // Down from the unread row is the idle one, and that is the row Enter focuses.
    expect(caps.intent).toHaveBeenCalledWith('focus-tab', { label: 'quiet' });
  });

  // A click both highlights and confirms. An arrow afterwards moves on and drops the confirmation, so
  // the row the user stepped away from is not the one the next Enter acts on.
  it('steps from the row that was clicked rather than from the top of the list', () => {
    const caps = capabilities();
    launcher(payload({
      tabs: [row('one', { busy: true }), row('two', { busy: true }), row('three', { busy: true })],
    }), caps);
    const list = screen.getByRole('listbox', { name: 'Open tabs' });

    fireEvent.click(screen.getByRole('option', { name: /two/ }));
    // The click also hands the keyboard to the list, which is the other half of the composed ref.
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });

    expect(caps.intent).toHaveBeenCalledWith('focus-tab', { label: 'three' });
  });

  // A selection moved by keyboard has to be visible without the caller chasing the DOM, and the shared
  // hook can only scroll a row it can reach — which it could not while the tab held the only ref.
  it('scrolls the row a keyboard selection lands on into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const names = ['one', 'two', 'three', 'four', 'five'];
    launcher(payload({ tabs: names.map((label) => row(label, { busy: true })) }));
    const list = screen.getByRole('listbox', { name: 'Open tabs' });

    fireEvent.keyDown(list, { key: 'End' });

    const drawn = [...list.querySelectorAll<HTMLElement>('.launcher-tab-row')];
    // The hook scrolls a selection whenever it moves, so the last scroll is the row the keyboard
    // landed on — reached through the composed ref, which is what it could not do before.
    expect(scrollIntoView.mock.instances.at(-1)).toBe(drawn[4]);
    expect(drawn[4]?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the status paragraph when a tab has one, and nothing when it does not', () => {
    launcher(payload({
      tabs: [row('shell'), row('quiet')],
      summaries: { shell: 'Running the test suite.' },
    }));

    expect(screen.getByText('Running the test suite.')).toBeInTheDocument();
    expect(screen.queryByText('', { selector: '.launcher-summary' })).not.toBeInTheDocument();
  });


  // An empty span with the right colour on it is what this row used to draw: the colour was right, so
  // the colour test passed, and nothing was painted. The dot is the tab's own glyph in the tab's own
  // colour, and it has a size to be seen at.
  it("draws every row with its tab's own dot colour, so a row matches its strip entry", () => {
    const { container } = launcher(payload({
      tabs: [row('janus', { dotColor: '#5b9cff' }), row('claude', { dotColor: '#c678dd' })],
    }));

    const dots = [...container.querySelectorAll<HTMLElement>('.launcher-dot')];
    expect(dots.map((dot) => dot.style.color)).toEqual(['rgb(91, 156, 255)', 'rgb(198, 120, 221)']);
    // The glyph the rest of the application's tab chrome draws, inside the span that carries the
    // colour — and a size in the stylesheet, so the shape has dimensions of its own.
    expect(dots.map((dot) => dot.querySelector('svg'))).toHaveLength(2);
    expect(dots.every((dot) => dot.querySelector('svg') !== null)).toBe(true);
    expect(readFileSync('web/src/plugins/launcher/launcher.css', 'utf8'))
      .toContain('width: 9px; height: 9px;');
  });

  it('lifts the row the host names as active into its own tier', () => {
    launcher(payload({
      tabs: [row('here', { active: true }), row('elsewhere', { busy: true })],
    }));

    const tiers = screen.getByRole('listbox', { name: 'Open tabs' }).querySelectorAll<HTMLElement>('.launcher-tier');
    expect([...tiers].map((tier) => tier.dataset.tier)).toEqual(['active', 'busy']);
    expect(tiers[0]?.querySelector('.launcher-tab-name')?.textContent).toBe('here');
  });

  it('says the rail is empty when nothing is open', () => {
    launcher(payload({ tabs: [] }));

    expect(screen.getByText('No open tabs')).toBeInTheDocument();
  });
});

  // A payload that has not moved is a payload that is not rebroadcast, so the age a row was drawn with
  // is the age it would keep forever without a clock of the view's own. The rail's promise is that
  // recency is visible, so it needs one.
  describe('a row\'s age', () => {
    const age = () => screen.getByText(/\d+[mhd]|now|never/).textContent;
    const tick = (minutes: number) => { act(() => { vi.advanceTimersByTime(minutes * 60_000); }); };

    it('advances on its own across the minute, hour, and day boundaries', () => {
      vi.useFakeTimers();
      try {
        const started = new Date('2026-01-01T12:00:00Z');
        vi.setSystemTime(started);
        launcher(payload({ tabs: [row('shell', { lastActivity: started.getTime() })] }));
        expect(age()).toBe('now');

        // One minute on, with nothing republished and nothing prompted.
        tick(1);
        expect(age()).toBe('1m');

        // Ninety minutes on, so the wording coarsens to the hour.
        tick(89);
        expect(age()).toBe('1h');

        // And three days from the start, so it coarsens again.
        tick(3 * 24 * 60 - 90);
        expect(age()).toBe('3d');
      } finally {
        vi.useRealTimers();
      }
    });

    // The clock is the view's, so it costs nothing while the launcher is not on screen — and the age
    // a returned rail shows is as of its return.
    it('stops while the launcher is not visible, and catches up when it returns', () => {
      vi.useFakeTimers();
      try {
        const started = new Date('2026-01-01T12:00:00Z');
        vi.setSystemTime(started);
        const caps = capabilities('left');
        caps.value.active = false;
        const rows = [row('shell', { lastActivity: started.getTime() })];
        const { rerender, intercept } = launcher(payload({ tabs: rows }), caps);

        tick(4);
        expect(age()).toBe('now');

        caps.value.active = true;
        rerender(
          <AppCommandBarProvider bar={bar(intercept)}>
            <AppCommandBarTabScope label="launcher">
              <LauncherTab payload={payload({ tabs: rows })} capabilities={caps.value} />
            </AppCommandBarTabScope>
          </AppCommandBarProvider>,
        );

        expect(age()).toBe('4m');
      } finally {
        vi.useRealTimers();
      }
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
