import { describe, it, expect, vi } from 'vitest';

vi.mock('../browser/command.js', () => ({
  isBrowserCommandLine: vi.fn((line: string) => line.startsWith('browser goto')),
  BROWSER_PRIMER: 'browser primer text',
}));
vi.mock('../question-command.js', () => ({
  isQuestionCommandLine: vi.fn((line: string) => line.startsWith('question ask')),
  QUESTION_PRIMER: 'question primer text',
  runQuestionCommand: vi.fn(() => 'question ran'),
}));

import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';

const setup = () => {
  const browserRun = vi.fn(async () => 'browser ran');
  const runInTab = vi.fn(() => 'db ran');
  const isCommandLine = vi.fn((line: string) => line.startsWith('db '));
  const managers = {
    browser: { run: browserRun },
    questions: { register: vi.fn() },
    database: { primer: 'db primer text', runInTab, isCommandLine },
  } as never;
  return { tools: createAcpToolTable(managers), browserRun, runInTab, isCommandLine };
};

describe('createAcpToolTable', () => {
  it('joins every entry fragment into the primer, in table order', () => {
    const { tools } = setup();
    expect(toolPrimer(tools)).toBe('browser primer text\n\nquestion primer text\n\ndb primer text');
  });

  it('lists the database entry last, so it is the fall-through', () => {
    const { tools } = setup();
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(tools.slice(0, -1).some((tool) => tool.match('anything at all'))).toBe(false);
  });
});

describe('toolRunner', () => {
  it('routes a browser command to the browser entry', async () => {
    const { tools, browserRun, runInTab } = setup();
    await expect(toolRunner(tools, 'tab1')('browser goto https://example.com')).resolves.toBe('browser ran');
    expect(browserRun).toHaveBeenCalledWith('tab1', 'browser goto https://example.com');
    expect(runInTab).not.toHaveBeenCalled();
  });

  it('routes a question command to the question entry', () => {
    const { tools, runInTab } = setup();
    expect(toolRunner(tools, 'tab1')('question ask "What port?"')).toBe('question ran');
    expect(runInTab).not.toHaveBeenCalled();
  });

  it('falls through to the database entry for an unmatched command', () => {
    const { tools, runInTab } = setup();
    expect(toolRunner(tools, 'tab1')('select 1')).toBe('db ran');
    expect(runInTab).toHaveBeenCalledWith('tab1', 'select 1');
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
  });
});
