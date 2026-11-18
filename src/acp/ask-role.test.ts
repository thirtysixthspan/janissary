import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  askRoleEntries, attemptOrder, defaultAskEntries, exhaustedError, fallbackNotice, finalAttemptResult,
  knownRoleSettings, readRoleSettings, type AttemptFailure,
} from './ask-role.js';
import type { AcpPromptResult } from './types.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-ask-role-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

function writeRoles(directory: string, roles: Record<string, unknown>): void {
  mkdirSync(path.join(directory, '.janissary'), { recursive: true });
  writeFileSync(path.join(directory, '.janissary', 'roles.json'), JSON.stringify(roles));
}

const CLAUDE = { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' };
const OPENCODE = { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' };
const CODEX = { harness: 'codex', model: 'gpt-6-luna', effort: 'high' };
const ASK_COMMANDS = [
  'db sqlite list', 'db sqlite query', 'browser goto', 'browser content', 'question ask', 'question approve',
  'file read', 'file glob', 'file grep', 'web search', 'web fetch',
];
const TELL_COMMANDS = [
  'db sqlite create', 'db sqlite delete', 'db sqlite query', 'db sqlite list',
  'browser goto', 'browser content', 'browser eval', 'question ask', 'question approve', 'file read',
  'file glob', 'file grep', 'file write', 'file edit', 'subagent',
];

describe('askRoleEntries', () => {
  it('uses the default ask entries, in order, when neither roles file exists, and creates no file', () => {
    const { home, root } = directories();

    expect(askRoleEntries(root, home)).toEqual([OPENCODE, CLAUDE, CODEX]);
    expect(existsSync(path.join(home, '.janissary', 'roles.json'))).toBe(false);
  });

  it('reads the home file’s ask role', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [CLAUDE] } });

    expect(askRoleEntries(root, home)).toEqual([CLAUDE]);
  });

  it('prefers the project file’s ask role over the home one', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [CLAUDE] } });
    writeRoles(root, { ask: { description: 'Questions.', entries: [CODEX, OPENCODE] } });

    expect(askRoleEntries(root, home)).toEqual([CODEX, OPENCODE]);
  });

  it('matches the role name trimmed and in any case', () => {
    const { home, root } = directories();
    writeRoles(home, { ' Ask ': { description: 'Questions.', entries: [CODEX] } });

    expect(askRoleEntries(root, home)).toEqual([CODEX]);
  });

  it('falls back to the default ask entries when the file has no ask role', () => {
    const { home, root } = directories();
    writeRoles(home, { planning: { description: 'Plans.', entries: [CLAUDE] } });

    expect(askRoleEntries(root, home)).toEqual(defaultAskEntries());
  });

  it('falls back to the default ask entries when the ask role lists none', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [] } });

    expect(askRoleEntries(root, home)).toEqual(defaultAskEntries());
  });
});

describe('readRoleSettings', () => {
  it('uses built-in entries and command grants when the requested role is absent', () => {
    const { home, root } = directories();
    writeRoles(home, { planning: { description: 'Plans.', entries: [], commands: [] } });
    const file = path.join(home, '.janissary', 'roles.json');
    const before = readFileSync(file, 'utf8');

    expect(readRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: ASK_COMMANDS,
    });
    const tell = readRoleSettings(root, 'tell', home);
    expect(tell.commands).toEqual(TELL_COMMANDS);
    expect(tell.commands).toHaveLength(18);
    expect(tell.commands).toEqual(expect.arrayContaining([
      'file glob', 'file grep', 'file write', 'file edit', 'file patch', 'web search', 'web fetch', 'subagent',
    ]));
    expect(tell.commands).toContain('file patch');
    expect(tell.commands.filter((command) => command === 'subagent')).toHaveLength(1);
    expect(ASK_COMMANDS).not.toContain('file patch');
    expect(knownRoleSettings(root, 'tell', home)).toEqual(tell);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('keeps an existing role grant list empty while falling back from empty model entries', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [], commands: [] } });

    expect(readRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: [],
    });
  });

  it('treats a missing command field on an existing role as no grants', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [CLAUDE] } });

    expect(readRoleSettings(root, 'ask', home)).toEqual({ name: 'ask', entries: [CLAUDE], commands: [] });
  });

  it('does not replace nonempty stored model entries or grants when they are unavailable to the caller', () => {
    const { home, root } = directories();
    const retired = { harness: 'retired-harness', model: 'retired-model' };
    writeRoles(home, {
      ask: { description: 'Questions.', entries: [retired], commands: ['future command'] },
    });

    expect(readRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [retired], commands: ['future command'],
    });
  });

  it('reads the current grants again for the next prompt', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [CLAUDE], commands: ['browser goto'] } });
    expect(readRoleSettings(root, 'ask', home).commands).toEqual(['browser goto']);

    writeRoles(home, { ask: { description: 'Questions.', entries: [CLAUDE], commands: ['question ask'] } });

    expect(readRoleSettings(root, 'ask', home).commands).toEqual(['question ask']);
  });

  it('keeps a saved tell role without file write or file edit', () => {
    const { home, root } = directories();
    writeRoles(home, { tell: { description: 'Tasks.', entries: [], commands: ['file read'] } });

    expect(readRoleSettings(root, 'tell', home).commands).toEqual(['file read']);
  });

  it('borrows built-in tell models but grants no tools for an empty command list', () => {
    const { home, root } = directories();
    writeRoles(home, { tell: { description: 'Tasks.', entries: [], commands: [] } });

    expect(readRoleSettings(root, 'tell', home)).toEqual({
      name: 'tell', entries: [OPENCODE, CLAUDE, CODEX], commands: [],
    });
    expect(knownRoleSettings(root, 'tell', home)).toEqual(readRoleSettings(root, 'tell', home));
  });

  it('borrows built-in tell models but grants no tools when the command field is absent', () => {
    const { home, root } = directories();
    writeRoles(home, { tell: { description: 'Tasks.', entries: [] } });

    expect(readRoleSettings(root, 'tell', home)).toEqual({
      name: 'tell', entries: [OPENCODE, CLAUDE, CODEX], commands: [],
    });
    expect(knownRoleSettings(root, 'tell', home)).toEqual(readRoleSettings(root, 'tell', home));
  });
});

describe('knownRoleSettings', () => {
  it('returns a known custom role with its canonical name, entries and commands', () => {
    const { home, root } = directories();
    writeRoles(home, {
      'review-bot': { description: 'Reviews.', entries: [CLAUDE], commands: ['file read'] },
    });

    expect(knownRoleSettings(root, 'review-bot', home)).toEqual({
      name: 'review-bot', entries: [CLAUDE], commands: ['file read'],
    });
  });

  it('matches a custom role trimmed and in any case while keeping its configured spelling', () => {
    const { home, root } = directories();
    writeRoles(home, {
      ' Review-Bot ': { description: 'Reviews.', entries: [CODEX], commands: [] },
    });

    expect(knownRoleSettings(root, '  REVIEW-bot  ', home)).toEqual({
      name: 'Review-Bot', entries: [CODEX], commands: [],
    });
  });

  it('returns undefined for an unknown name', () => {
    const { home, root } = directories();
    writeRoles(home, { planning: { description: 'Plans.', entries: [], commands: [] } });

    expect(knownRoleSettings(root, 'not-a-role', home)).toBeUndefined();
  });

  it('returns undefined for a whitespace-only name', () => {
    const { home, root } = directories();

    expect(knownRoleSettings(root, ' '.repeat(3), home)).toBeUndefined();
  });

  it('recognizes a built-in role when no file exists and creates no file', () => {
    const { home, root } = directories();

    expect(knownRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: ASK_COMMANDS,
    });
    expect(existsSync(path.join(home, '.janissary', 'roles.json'))).toBe(false);
  });

  it('hides a home-only custom role when a project file replaces the home file', () => {
    const { home, root } = directories();
    writeRoles(home, { 'home-only': { description: 'Home.', entries: [CLAUDE], commands: [] } });
    writeRoles(root, { ask: { description: 'Questions.', entries: [CLAUDE], commands: [] } });

    expect(knownRoleSettings(root, 'home-only', home)).toBeUndefined();
  });

  it('hides home roles while keeping built-ins known for an empty project object', () => {
    const { home, root } = directories();
    writeRoles(home, { 'home-only': { description: 'Home.', entries: [CLAUDE], commands: [] } });
    writeRoles(root, {});
    const homeFile = path.join(home, '.janissary', 'roles.json');
    const projectFile = path.join(root, '.janissary', 'roles.json');
    const homeBefore = readFileSync(homeFile, 'utf8');
    const projectBefore = readFileSync(projectFile, 'utf8');

    expect(JSON.parse(projectBefore)).toEqual({});
    expect(knownRoleSettings(root, 'home-only', home)).toBeUndefined();
    expect(knownRoleSettings(root, 'tell', home)).toEqual({
      name: 'tell', entries: [OPENCODE, CLAUDE, CODEX], commands: TELL_COMMANDS,
    });
    expect(readRoleSettings(root, 'tell', home)).toEqual(knownRoleSettings(root, 'tell', home));
    expect(readFileSync(homeFile, 'utf8')).toBe(homeBefore);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
  });

  it('keeps a known custom role that lists zero entries', () => {
    const { home, root } = directories();
    writeRoles(home, {
      'no-models': { description: 'None.', entries: [], commands: ['file read'] },
    });

    expect(knownRoleSettings(root, 'no-models', home)).toEqual({
      name: 'no-models', entries: [], commands: ['file read'],
    });
  });

  it('borrows built-in entries for a configured built-in role with empty entries', () => {
    const { home, root } = directories();
    writeRoles(home, { ask: { description: 'Questions.', entries: [], commands: [] } });

    expect(knownRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: [],
    });
  });

  it('preserves configured grants when both stored and built-in entries are empty', () => {
    const { home, root } = directories();
    writeRoles(home, {
      research: { description: 'Research.', entries: [], commands: ['file read', 'file glob'] },
    });

    expect(knownRoleSettings(root, 'research', home)).toEqual({
      name: 'research', entries: [], commands: ['file read', 'file glob'],
    });
  });

  it('preserves nonempty stored entries even when they are unavailable to the caller', () => {
    const { home, root } = directories();
    const retired = { harness: 'retired-harness', model: 'retired-model' };
    writeRoles(home, {
      ask: { description: 'Questions.', entries: [retired], commands: ['future command'] },
    });

    expect(knownRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [retired], commands: ['future command'],
    });
  });

  it('falls back from a damaged project file to a known role in the home file', () => {
    const { home, root } = directories();
    writeRoles(home, { 'home-only': { description: 'Home.', entries: [CLAUDE], commands: [] } });
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'roles.json'), '{ not json');

    expect(knownRoleSettings(root, 'home-only', home)).toEqual({
      name: 'home-only', entries: [CLAUDE], commands: [],
    });
  });

  it('reads the current settings again on a later call', () => {
    const { home, root } = directories();
    writeRoles(home, {
      'review-bot': { description: 'Reviews.', entries: [CLAUDE], commands: ['file read'] },
    });
    expect(knownRoleSettings(root, 'review-bot', home)?.commands).toEqual(['file read']);

    writeRoles(home, {
      'review-bot': { description: 'Reviews.', entries: [CODEX], commands: ['file write'] },
    });

    expect(knownRoleSettings(root, 'review-bot', home)).toEqual({
      name: 'review-bot', entries: [CODEX], commands: ['file write'],
    });
  });

  it('returns detached copies of entries and commands', () => {
    const { home, root } = directories();

    const first = knownRoleSettings(root, 'ask', home);
    expect(first).toBeDefined();
    if (!first) return;
    first.entries.push(CODEX);
    first.commands.push('extra command');
    first.entries[0].model = 'mutated';

    expect(knownRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: ASK_COMMANDS,
    });
  });
});

describe('attemptOrder', () => {
  it('keeps the role order when no session is open', () => {
    expect(attemptOrder([OPENCODE, CLAUDE, CODEX])).toEqual([OPENCODE, CLAUDE, CODEX]);
  });

  it('tries the open session’s entry first without trying it twice', () => {
    expect(attemptOrder([OPENCODE, CLAUDE, CODEX], CLAUDE)).toEqual([CLAUDE, OPENCODE, CODEX]);
  });
});

describe('fallback messages', () => {
  it('names the failed entry and the next one', () => {
    expect(fallbackNotice(OPENCODE, CLAUDE))
      .toBe('ACP: opencode opencode-go/deepseek-v4.1-flash failed — trying claude claude-haiku-4-5.');
  });

  it('lists every attempt when the whole role failed', () => {
    expect(exhaustedError([
      { entry: OPENCODE, error: 'ACP error: out of credits' },
      { entry: CLAUDE, error: 'ACP: ACP agent exited.' },
    ])).toBe([
      'ACP: every model in the ask role failed.',
      '- opencode opencode-go/deepseek-v4.1-flash: ACP error: out of credits',
      '- claude claude-haiku-4-5: ACP: ACP agent exited.',
    ].join('\n'));
  });

  it('names a custom role in the header while preserving failure order and text', () => {
    expect(exhaustedError([
      { entry: OPENCODE, error: 'ACP error: out of credits' },
      { entry: CLAUDE, error: 'ACP: ACP agent exited.' },
    ], 'review-bot')).toBe([
      'ACP: every model in the review-bot role failed.',
      '- opencode opencode-go/deepseek-v4.1-flash: ACP error: out of credits',
      '- claude claude-haiku-4-5: ACP: ACP agent exited.',
    ].join('\n'));
  });

  it('keeps the tell role in the header when it is passed explicitly', () => {
    expect(exhaustedError([{ entry: CLAUDE, error: 'ACP: ACP agent exited.' }], 'tell')).toBe([
      'ACP: every model in the tell role failed.',
      '- claude claude-haiku-4-5: ACP: ACP agent exited.',
    ].join('\n'));
  });
});

describe('finalAttemptResult', () => {
  const failures: AttemptFailure[] = [
    { entry: OPENCODE, error: 'ACP error: out of credits' },
    { entry: CLAUDE, error: 'ACP error: not authenticated' },
  ];

  it.each(['ask', 'tell'] as const)('keeps the record id on the %s exhausted error', (role) => {
    const result = finalAttemptResult(
      { answered: false, error: 'ACP error: not authenticated', recordId: 'record-2' }, true, failures, role,
    );

    expect(result).toEqual({ answered: false, error: exhaustedError(failures, role), recordId: 'record-2' });
  });

  it('leaves no record id key on an exhausted error rebuilt from a result with none', () => {
    const result = finalAttemptResult({ answered: false, error: 'ACP error: not authenticated' }, true, failures, 'ask');

    expect(result).toEqual({ answered: false, error: exhaustedError(failures, 'ask') });
    expect(result).not.toHaveProperty('recordId');
  });

  it('returns the same object for a single failure', () => {
    const result: AcpPromptResult = { answered: false, error: 'ACP error: boom', recordId: 'record-1' };

    expect(finalAttemptResult(result, true, failures.slice(0, 1), 'ask')).toBe(result);
  });

  it('returns the same object for an answered result', () => {
    const result: AcpPromptResult = { answered: true, reply: 'the answer', session: 'acp-1', recordId: 'record-1' };

    expect(finalAttemptResult(result, false, failures, 'ask')).toBe(result);
  });

  it('returns the same object for an unanswered result the model did not fail, even with two failures listed', () => {
    const result: AcpPromptResult = { answered: false, error: 'ACP: a prompt is already running.' };

    expect(finalAttemptResult(result, false, failures, 'ask')).toBe(result);
  });
});
