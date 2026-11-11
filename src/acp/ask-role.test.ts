import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  askRoleEntries, attemptOrder, defaultAskEntries, exhaustedError, fallbackNotice, finalAttemptResult,
  readRoleSettings, type AttemptFailure,
} from './ask-role.js';
import type { AcpPromptResult } from './types.js';

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-ask-role-'));
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
  'db sqlite list', 'db sqlite query', 'browser goto', 'browser content', 'question ask', 'question approve', 'file read',
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

    expect(readRoleSettings(root, 'ask', home)).toEqual({
      name: 'ask', entries: [OPENCODE, CLAUDE, CODEX], commands: ASK_COMMANDS,
    });
    expect(readRoleSettings(root, 'tell', home).commands).toHaveLength(10);
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
