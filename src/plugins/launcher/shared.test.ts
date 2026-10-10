import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONFIGURE_INTENT_ID,
  LAUNCHER_INSTANCE_KEY,
  LAUNCHER_LABEL,
  LAUNCHER_PAYLOAD_SCHEMA_VERSION,
  SUMMARIZER_FLUSH_MS,
  isDispatchIntent,
  isEmptyIntent,
  isFocusTabIntent,
  isLauncherOwn,
  isLauncherPayload,
  isReportIconIntent,
  isRunCommandIntent,
} from './shared.js';
import type { LauncherCommand, LauncherPayload, LauncherTabRow } from './shared.js';

// The contract both sides read. It is the one module the client reaches from inside the launcher's
// own lazy chunk, so it must import nothing: a guard borrowed from the host's API module would drag
// that module's graph into the browser bundle for three lines of predicate. The boundary lint cannot
// see it — the server plugin block permits `../api.js` — so the source is read here instead.
const CONTRACT_SOURCE = readFileSync(new URL('shared.ts', import.meta.url), 'utf8');

function command(overrides: Partial<LauncherCommand> = {}): LauncherCommand {
  return { id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks', ...overrides };
}

function row(overrides: Partial<LauncherTabRow> = {}): LauncherTabRow {
  return {
    label: 'shell', type: 'shell', group: 1, groupColor: '#5b9cff', dotColor: '#5b9cff', active: false, busy: false, hasUnread: false,
    needsInput: false, lastActivity: 60_000, cwd: '/repo', ...overrides,
  };
}

function payload(overrides: Partial<LauncherPayload> = {}): LauncherPayload {
  return {
    commands: [command()],
    tabs: [row()],
    summaries: { shell: 'Running the test suite.' },
    source: 'project',
    filePath: '/repo/.janissary/launcher.json',
    ...overrides,
  };
}

describe('the shared contract', () => {
  it('imports nothing, because the client reads it from inside the launcher\'s own chunk', () => {
    expect(CONTRACT_SOURCE).not.toMatch(/^\s*import\s/mu);
  });

  it('carries the constants the two sides have to agree on', () => {
    expect(LAUNCHER_PAYLOAD_SCHEMA_VERSION).toBe(1);
    expect(LAUNCHER_INSTANCE_KEY).toBe('launcher');
    expect(LAUNCHER_LABEL).toBe('launcher');
    expect(SUMMARIZER_FLUSH_MS).toBe(30_000);
    expect(CONFIGURE_INTENT_ID).toBe('configure');
  });

  // The predicate that opens almost every guard below. An array is the case that matters: it is an
  // object, it has no keys, and a guard that only tested for null would take it for a record.
  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'payload'],
    ['a number', 7],
  ])('rejects %s where a record is wanted', (_name, value) => {
    expect(isLauncherPayload(value)).toBe(false);
    expect(isRunCommandIntent(value)).toBe(false);
    expect(isEmptyIntent(value)).toBe(false);
  });
});

describe('the payload guard', () => {
  it('accepts a payload the host would publish', () => {
    expect(isLauncherPayload(payload())).toBe(true);
  });

  it('accepts a payload with no summaries, no remote, and no last command', () => {
    expect(isLauncherPayload(payload({
      summaries: {}, tabs: [row({ remote: undefined, lastCommand: undefined })],
    }))).toBe(true);
  });

  it.each([
    ['a command with no id', { commands: [command({ id: '' })] }],
    ['a command with nothing to dispatch', { commands: [command({ command: ' ' })] }],
    ['a command that is not an object', { commands: ['tasks'] }],
    ['a row with no label', { tabs: [row({ label: '' })] }],
    ['a row with no dot colour', { tabs: [row({ dotColor: '' })] }],
    ['a row with a view the rail does not draw', { tabs: [row({ view: 'nonsense' as LauncherTabRow['view'] })] }],
    ['a row with a pane that is not the right one', { tabs: [row({ pane: 'left' as LauncherTabRow['pane'] })] }],
    ['a row that is not a record', { tabs: ['shell'] }],
    ['a summary that is not a string', { summaries: { shell: 7 } }],
    ['a source the rail does not know', { source: 'elsewhere' as LauncherPayload['source'] }],
  ])('rejects %s', (_name, override) => {
    expect(isLauncherPayload(payload(override))).toBe(false);
  });
});

describe('the intent guards', () => {
  it('accepts a run-command intent naming an id', () => {
    expect(isRunCommandIntent({ id: 'tasks' })).toBe(true);
  });

  it('rejects a run-command intent with no id', () => {
    expect(isRunCommandIntent({ id: '' })).toBe(false);
    expect(isRunCommandIntent({})).toBe(false);
  });

  it('accepts a dispatch intent naming a line', () => {
    expect(isDispatchIntent({ line: 'schedules left' })).toBe(true);
  });

  it('rejects a dispatch intent with no line', () => {
    expect(isDispatchIntent({ line: '' })).toBe(false);
    expect(isDispatchIntent({})).toBe(false);
  });

  it('accepts a report-icon intent naming a glyph', () => {
    expect(isReportIconIntent({ icon: 'faNotAGlyph' })).toBe(true);
  });

  it('rejects a report-icon intent with no name', () => {
    expect(isReportIconIntent({ icon: '' })).toBe(false);
    expect(isReportIconIntent({})).toBe(false);
  });

  it('accepts a focus-tab intent naming a label', () => {
    expect(isFocusTabIntent({ label: 'shell' })).toBe(true);
  });

  it('rejects a focus-tab intent with no label', () => {
    expect(isFocusTabIntent({ label: '' })).toBe(false);
    expect(isFocusTabIntent({})).toBe(false);
  });

  // The flush's payload is the empty object, and only that. An array has no keys either and is not it.
  it('accepts the empty object as the flush\'s payload, and nothing else', () => {
    expect(isEmptyIntent({})).toBe(true);
    expect(isEmptyIntent([])).toBe(false);
    expect(isEmptyIntent({ line: 'tasks' })).toBe(false);
  });
});

// The ownership rule both the pull and the push path read. The host identifies a plugin tab by its
// declaration id and the instance key it was opened under; a label is the host's to mint.
describe('naming the launcher\'s own tabs', () => {
  it('recognises a tab opened under the launcher\'s own instance key', () => {
    expect(isLauncherOwn({ label: 'launcher', plugin: { id: 'launcher', instanceKey: 'launcher' } })).toBe(true);
    expect(isLauncherOwn({ label: 'launcher-2', plugin: { id: 'launcher', instanceKey: 'launcher' } })).toBe(true);
  });

  it('does not recognise another plugin\'s tab, whatever it is labelled', () => {
    expect(isLauncherOwn({ label: 'launcher', plugin: { id: 'shell', instanceKey: 'shell-1' } })).toBe(false);
    expect(isLauncherOwn({ label: 'shell', plugin: { id: 'shell', instanceKey: 'shell-1' } })).toBe(false);
    expect(isLauncherOwn({ label: 'other', plugin: { id: 'other', instanceKey: 'launcher' } })).toBe(false);
  });

  it('does not recognise a tab no plugin owns', () => {
    expect(isLauncherOwn({ label: 'launcher' })).toBe(false);
  });

  // A plugin tab with the launcher's label and another owner is somebody else's row.
  it('does not recognise a tab that merely carries the launcher\'s label', () => {
    expect(isLauncherOwn({ label: 'launcher', plugin: { id: 'shell', instanceKey: 'shell-1' } })).toBe(false);
    expect(isLauncherOwn({ label: 'launcher' })).toBe(false);
  });
});
