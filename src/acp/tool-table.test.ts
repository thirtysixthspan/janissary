import { describe, it, expect, vi } from 'vitest';

vi.mock('../browser/command.js', () => ({
  isBrowserCommandLine: vi.fn((line: string) => line.startsWith('browser ')),
  BROWSER_PRIMER: 'browser primer text',
}));
vi.mock('../question-command.js', () => ({
  isQuestionCommandLine: vi.fn((line: string) => line.startsWith('question ask')),
  QUESTION_PRIMER: 'question primer text',
  runQuestionCommand: vi.fn(() => 'question ran'),
}));

import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';

const setup = (grants: readonly string[] = NATIVE_ACP_COMMANDS) => {
  const browserRun = vi.fn(async () => 'browser ran');
  const runInTab = vi.fn(() => 'db ran');
  const isCommandLine = vi.fn((line: string) => line.startsWith('db '));
  const managers = {
    browser: { run: browserRun },
    questions: { register: vi.fn() },
    database: { primer: 'db primer text', runInTab, isCommandLine },
  } as never;
  return {
    tools: createAcpToolTable(managers, 'ask', grants), browserRun, runInTab, isCommandLine,
  };
};

describe('createAcpToolTable', () => {
  it('keeps the existing table order and appends the canonical allow-list', () => {
    const { tools } = setup();
    expect(toolPrimer(tools, NATIVE_ACP_COMMANDS)).toBe([
      'browser primer text',
      'question primer text',
      'db primer text',
      `Only these commands are allowed: ${NATIVE_ACP_COMMANDS.join(', ')}.`,
    ].join('\n\n'));
  });

  it('filters omitted owners and de-duplicates unknown grants in the allow-list', () => {
    const grants = ['browser goto', 'browser goto', 'unknown command'];
    const { tools } = setup(grants);
    expect(tools).toHaveLength(1);
    expect(toolPrimer(tools, grants)).toBe(
      'browser primer text\n\nOnly these commands are allowed: browser goto.',
    );
    expect(toolExtractor(tools)('question ask x')).toBeNull();
    expect(toolExtractor(tools)('db sqlite list')).toBeNull();
  });

  it('returns no tools or primer when the role has no grants', () => {
    const { tools } = setup([]);
    expect(tools).toEqual([]);
    expect(toolPrimer(tools, [])).toBe('');
    expect(toolExtractor(tools)('browser goto x')).toBeNull();
  });

  it('keeps the database entry last when it is included', () => {
    const { tools } = setup();
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(tools.slice(0, -1).some((tool) => tool.match('anything at all'))).toBe(false);
  });
});

describe('toolRunner', () => {
  it('routes a browser command to the browser entry', async () => {
    const { tools, browserRun, runInTab } = setup();
    await expect(toolRunner(tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')(
      'browser goto https://example.com',
    )).resolves.toBe('browser ran');
    expect(browserRun).toHaveBeenCalledWith('tab1', 'browser goto https://example.com');
    expect(runInTab).not.toHaveBeenCalled();
  });

  it('routes a question command to the question entry', () => {
    const { tools, runInTab } = setup();
    expect(toolRunner(tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')(
      'question ask "What port?"',
    )).toBe('question ran');
    expect(runInTab).not.toHaveBeenCalled();
  });

  it('routes an allowed database command with trailing arguments', () => {
    const { tools, runInTab } = setup(['db sqlite query']);
    expect(toolRunner(tools, 'ask', ['db sqlite query'], 'tab1')(
      'db sqlite query shop SELECT 1',
    )).toBe('db ran');
    expect(runInTab).toHaveBeenCalledWith('tab1', 'db sqlite query shop SELECT 1');
  });

  it('returns the exact refusal for an ungranted command owned by an included tool', () => {
    const grants = ['browser goto'];
    const { tools, browserRun, runInTab } = setup(grants);
    const command = 'browser eval document.title';
    expect(toolExtractor(tools)(command)).toBe(command);
    expect(toolRunner(tools, 'Reader', grants, 'tab1')(command)).toBe(
      'Command not allowed for role "Reader": browser eval.',
    );
    expect(browserRun).not.toHaveBeenCalled();
    expect(runInTab).not.toHaveBeenCalled();
  });

  it('does not pass an unknown command to the database catch-all', () => {
    const { tools, runInTab } = setup();
    expect(() => toolRunner(tools, 'ask', NATIVE_ACP_COMMANDS, 'tab1')('select 1'))
      .toThrow('No ACP tool matched command: select 1');
    expect(runInTab).not.toHaveBeenCalled();
  });
});

describe('toolExtractor', () => {
  it('returns the command line a tool recognizes', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('Let me look.\nbrowser goto x')).toBe('browser goto x');
    expect(toolExtractor(tools)('I need to ask.\nquestion ask x')).toBe('question ask x');
  });

  it('reaches the database entry through its manager predicate', () => {
    const { tools, isCommandLine } = setup();
    expect(toolExtractor(tools)('Checking.\ndb sqlite list')).toBe('db sqlite list');
    expect(isCommandLine).toHaveBeenCalledWith('db sqlite list');
  });

  it('picks the last command line even when an earlier line belongs to a tool listed first', () => {
    const { tools } = setup();
    const reply = 'Earlier I ran:\nbrowser goto x\nNow the data:\ndb sqlite query shop SELECT 1';
    expect(toolExtractor(tools)(reply)).toBe('db sqlite query shop SELECT 1');
  });

  it('picks a trailing browser line over an earlier database line', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('db sqlite list\nthen\nbrowser goto x')).toBe('browser goto x');
  });

  it('returns null when no line is a command', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('here is the final answer')).toBeNull();
    expect(toolExtractor(tools)('browser open https://example.com')).toBeNull();
  });
});
