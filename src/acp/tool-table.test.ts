import { describe, it, expect, vi } from 'vitest';

vi.mock('../browser/command.js', () => ({
  extractBrowserCommand: vi.fn((text: string) => (text.includes('browser goto') ? 'browser goto x' : null)),
  BROWSER_PRIMER: 'browser primer text',
}));
vi.mock('../question-command.js', () => ({
  extractQuestionCommand: vi.fn((text: string) => (text.includes('question ask') ? 'question ask x' : null)),
  QUESTION_PRIMER: 'question primer text',
  runQuestionCommand: vi.fn(() => 'question ran'),
}));

import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';

const setup = () => {
  const browserRun = vi.fn(async () => 'browser ran');
  const runInTab = vi.fn(() => 'db ran');
  const extract = vi.fn((text: string) => (text.includes('select 1') ? 'select 1' : undefined));
  const managers = {
    browser: { run: browserRun },
    questions: { register: vi.fn() },
    database: { primer: 'db primer text', runInTab, extract },
  } as never;
  return { tools: createAcpToolTable(managers), browserRun, runInTab, extract };
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
  it('returns the command the first claiming entry finds', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('run browser goto x please')).toBe('browser goto x');
    expect(toolExtractor(tools)('try question ask x')).toBe('question ask x');
  });

  it('reaches the database entry, whose extractor reports absence as undefined', () => {
    const { tools, extract } = setup();
    expect(toolExtractor(tools)('please run select 1')).toBe('select 1');
    expect(extract).toHaveBeenCalledWith('please run select 1');
  });

  it('returns null when no entry claims the reply', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('here is the final answer')).toBeNull();
  });
});
