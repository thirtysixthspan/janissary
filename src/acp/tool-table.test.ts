import { describe, it, expect, vi } from 'vitest';

vi.mock('../browser/command.js', () => ({
  isBrowserCommandLine: vi.fn((line: string) => line.startsWith('browser ')),
  BROWSER_PRIMER: 'browser primer text',
}));
vi.mock('../question-command.js', () => ({
  isQuestionCommandLine: vi.fn((line: string) => line.startsWith('question ask')),
  QUESTION_PRIMER: 'question primer text',
}));
import {
  createAcpToolTable, gateCommand, toolPrimer, toolExtractor, type AcpTool,
} from './tool-table.js';
import type { AcpRunSnapshot, AcpRunSnapshotRow } from './types.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { DB_PRIMER } from '../database/primer.js';
import { FILE_READ_PRIMER } from '../file-read/command.js';
import { FILE_MUTATION_PRIMER } from '../file-write/command.js';
import { FILE_GLOB_PRIMER } from '../file-glob/command.js';
import { FILE_GREP_PRIMER } from '../file-grep/command.js';
import { FILE_PATCH_PRIMER } from '../file-patch/command.js';
import { WEB_SEARCH_PRIMER } from '../web/search/command.js';
import { WEB_FETCH_PRIMER } from '../web/fetch/command.js';
import { SUBAGENT_PRIMER } from '../subagent/primer.js';
import { NOTIFY_PRIMER } from '../notifications/primer.js';

const setup = (grants: readonly string[] = NATIVE_ACP_COMMANDS) => ({ tools: createAcpToolTable(grants) });

describe('createAcpToolTable', () => {
  it('builds from grants alone, with no managers object', () => {
    const tools = createAcpToolTable(['browser goto', 'db sqlite list']);
    expect(tools.map((tool) => tool.primer)).toEqual(['browser primer text', DB_PRIMER]);
  });

  it('keeps the existing table order and appends the canonical allow-list', () => {
    const { tools } = setup();
    expect(toolPrimer(tools, NATIVE_ACP_COMMANDS)).toBe([
      'browser primer text',
      'question primer text',
      `${FILE_READ_PRIMER}\n\n${FILE_GLOB_PRIMER}\n\n${FILE_GREP_PRIMER}\n\n${FILE_MUTATION_PRIMER}\n\n${FILE_PATCH_PRIMER}`,
      `${WEB_SEARCH_PRIMER}\n\n${WEB_FETCH_PRIMER}`,
      SUBAGENT_PRIMER,
      NOTIFY_PRIMER,
      DB_PRIMER,
      `Only these commands are allowed: ${NATIVE_ACP_COMMANDS.join(', ')}.`,
    ].join('\n\n'));
  });

  it('gives a file-read-only grant the read primer and omits the file entry when no file command is granted', () => {
    const [file, ...rest] = createAcpToolTable(['file read']);
    expect(rest).toEqual([]);
    expect(file.runsOn).toBe('workspace');
    expect(file.primer).toBe(FILE_READ_PRIMER);
    const without = createAcpToolTable(NATIVE_ACP_COMMANDS.filter((command) => !command.startsWith('file ')));
    expect(without.some((tool) => tool.primer === FILE_READ_PRIMER)).toBe(false);
    expect(toolPrimer(without, NATIVE_ACP_COMMANDS)).not.toContain(FILE_READ_PRIMER);
  });

  it('builds one workspace web tool from a web search grant', () => {
    const tools = createAcpToolTable(['web search']);
    expect(tools).toHaveLength(1);
    expect(tools[0].runsOn).toBe('workspace');
    expect(tools[0].primer).toBe(WEB_SEARCH_PRIMER);
    expect(toolPrimer(tools, ['web search'])).toBe(
      `${WEB_SEARCH_PRIMER}\n\nOnly these commands are allowed: web search.`,
    );
  });

  it('builds one workspace web tool from a web fetch grant', () => {
    const tools = createAcpToolTable(['web fetch']);
    expect(tools).toHaveLength(1);
    expect(tools[0].runsOn).toBe('workspace');
    expect(tools[0].primer).toBe(WEB_FETCH_PRIMER);
    expect(toolPrimer(tools, ['web fetch'])).toBe(
      `${WEB_FETCH_PRIMER}\n\nOnly these commands are allowed: web fetch.`,
    );
  });

  it.each([
    ['web search', 'web fetch'],
    ['web fetch', 'web search'],
  ])('joins both web primers in search-then-fetch order for grants %j', (first, second) => {
    const tools = createAcpToolTable([first, second]);
    expect(tools).toHaveLength(1);
    expect(tools[0].primer).toBe(`${WEB_SEARCH_PRIMER}\n\n${WEB_FETCH_PRIMER}`);
  });

  it('omits the web tool and its primer unless a web command is granted', () => {
    const without = NATIVE_ACP_COMMANDS.filter((command) => command !== 'web search' && command !== 'web fetch');
    const tools = createAcpToolTable(without);
    for (const primer of [WEB_SEARCH_PRIMER, WEB_FETCH_PRIMER]) {
      const firstLine = primer.split('\n', 1)[0];
      expect(tools.some((tool) => tool.primer.includes(firstLine))).toBe(false);
      expect(toolPrimer(tools, without)).not.toContain(firstLine);
    }
  });

  it('orders the file, web, and database primers between the caller-side entries', () => {
    const tools = createAcpToolTable(['file read', 'web search', 'db sqlite list']);
    expect(tools.map((tool) => tool.primer)).toEqual([FILE_READ_PRIMER, WEB_SEARCH_PRIMER, DB_PRIMER]);
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

  it('runs the file and web entries on the workspace and the others on the caller side', () => {
    const { tools } = setup();
    expect(tools.map((tool) => tool.runsOn)).toEqual(['caller', 'caller', 'workspace', 'workspace', 'caller', 'caller', 'caller']);
  });

  it('keeps the database entry last when it is included', () => {
    const { tools } = setup();
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(tools.slice(0, -1).some((tool) => tool.match('anything at all'))).toBe(false);
    const file = tools.find((tool) => tool.runsOn === 'workspace')!;
    expect(file.match('anything at all')).toBe(false);
    expect(file.match('db sqlite list')).toBe(false);
    const web = tools.find((tool) => tool.primer === `${WEB_SEARCH_PRIMER}\n\n${WEB_FETCH_PRIMER}`)!;
    expect(web.match('anything at all')).toBe(false);
    expect(web.match('db sqlite list')).toBe(false);
  });

  it('keeps every included group primer while listing only the given allow-list', () => {
    const { tools } = setup(['browser goto', 'db sqlite list']);
    expect(toolPrimer(tools, ['db sqlite list'])).toBe([
      'browser primer text',
      DB_PRIMER,
      'Only these commands are allowed: db sqlite list.',
    ].join('\n\n'));
  });

  it('keeps the group primer and extraction for a granted owner whose only command is not allowed', () => {
    const { tools } = setup(['browser goto']);
    expect(tools).toHaveLength(1);
    expect(toolPrimer(tools, [])).toBe('browser primer text');
    expect(toolExtractor(tools)('browser goto x')).toBe('browser goto x');
  });
});

describe('gateCommand', () => {
  const gateTools: AcpTool[] = [
    {
      primer: 'browser',
      match: (command) => /^browser\b/i.test(command),
      isCommandLine: () => false,
      runsOn: 'caller',
    },
    {
      primer: 'db',
      match: (command) => /^db\b/i.test(command),
      isCommandLine: () => false,
      runsOn: 'workspace',
    },
  ];

  const core = (overrides: {
    grants?: readonly string[];
    rows?: readonly AcpRunSnapshotRow[];
    roleName?: string;
  } = {}): AcpRunSnapshot => ({
    kind: 'core',
    role: 'ask',
    roleName: overrides.roleName ?? 'ask',
    grants: overrides.grants ?? ['browser goto', 'db sqlite query'],
    rows: overrides.rows ?? [],
    withoutTools: false,
  });

  const dbOff: AcpRunSnapshotRow = { name: 'db sqlite query', effectiveEnabled: false, effectiveAgentAccess: true };

  it('throws for a command with no native name or no claiming tool', () => {
    expect(() => gateCommand(core(), gateTools, 'select 1')).toThrow('No ACP tool matched command: select 1');
    expect(() => gateCommand(core(), gateTools, 'question ask "x"'))
      .toThrow('No ACP tool matched command: question ask "x"');
  });

  it('refuses a disabled command and marks it disabled', () => {
    expect(gateCommand(core({ rows: [dbOff] }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('refuses an agent-off command with the same text and flag', () => {
    const rows = [{ name: 'db sqlite query', effectiveEnabled: true, effectiveAgentAccess: false }];
    expect(gateCommand(core({ rows }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('reports the disabled refusal for a disabled ungranted command', () => {
    expect(gateCommand(core({ rows: [dbOff], grants: [] }), gateTools, 'db sqlite query select 1')).toStrictEqual({
      refusal: 'Command is disabled: db sqlite query.', refused: 'disabled',
    });
  });

  it('refuses an enabled ungranted command with the role refusal and no refused key', () => {
    const snapshot = core({ grants: ['db sqlite query'], roleName: 'researcher' });
    expect(gateCommand(snapshot, gateTools, 'browser goto https://x')).toStrictEqual({
      refusal: 'Command not allowed for role "researcher": browser goto.',
    });
  });

  it('allows a granted command with no row and returns the matched tool side', () => {
    expect(gateCommand(core(), gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
    expect(gateCommand(core(), gateTools, 'db sqlite query select 1')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('allows a granted command whose row is enabled with agent access', () => {
    const rows = [{ name: 'browser goto', effectiveEnabled: true, effectiveAgentAccess: true }];
    expect(gateCommand(core({ rows }), gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
  });

  it('decides the same way twice from a deep-frozen snapshot', () => {
    const rows = Object.freeze([Object.freeze({ ...dbOff })]);
    const snapshot = Object.freeze(core({ rows, grants: Object.freeze(['browser goto']) }));
    const first = gateCommand(snapshot, gateTools, 'db sqlite query select 1');
    expect(gateCommand(snapshot, gateTools, 'db sqlite query select 1')).toStrictEqual(first);
    expect(gateCommand(snapshot, gateTools, 'browser goto https://x')).toStrictEqual({ runsOn: 'caller' });
  });

  const agent = (overrides: { grants?: readonly string[]; askUser?: boolean } = {}): AcpRunSnapshot => ({
    kind: 'agent',
    grants: overrides.grants ?? [],
    askUser: overrides.askUser ?? false,
  });

  it('runs a granted agent file read on the workspace', () => {
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file read a.md')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('refuses an ungranted agent file read with no refused key', () => {
    expect(gateCommand(agent({ grants: ['db'] }), [], 'file read a.md')).toStrictEqual({
      refusal: 'Agent: command not permitted: file read a.md.',
    });
  });

  it('matches agent file read case-insensitively and after a leading slash', () => {
    const granted = agent({ grants: ['file'] });
    expect(gateCommand(granted, [], 'FILE READ a.md')).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(granted, [], '  file read a.md')).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(granted, [], '/file read a.md')).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(agent(), [], '/file read a.md')).toStrictEqual({
      refusal: 'Agent: command not permitted: /file read a.md.',
    });
  });

  it.each(['file readme x', 'db sqlite list', 'question ask "x"', 'webby x', 'websearch x'])(
    'runs the agent command %s on the caller side',
    (command) => {
      expect(gateCommand(agent(), [], command)).toStrictEqual({ runsOn: 'caller' });
    },
  );

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('refuses agent file mutations when %s', (_label, grants) => {
    for (const command of ['file write {"path":"a.md"}', 'file edit {"path":"a.md"}', '/file write {"path":"a.md"}', 'FILE WRITE {"path":"a.md"}', 'file edit {']) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({
        refusal: `Agent: command not permitted: ${command}.`,
      });
    }
  });

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('refuses agent file patches when %s', (_label, grants) => {
    for (const command of ['file patch {"patchText":"x"}', 'file patch', 'FILE PATCH {', '/file patch {}']) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({
        refusal: `Agent: command not permitted: ${command}.`,
      });
    }
  });

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('refuses agent file globs when %s', (_label, grants) => {
    for (const command of ['file glob **/*', 'file glob', 'FILE GLOB x', '/file glob x']) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({
        refusal: `Agent: command not permitted: ${command}.`,
      });
    }
  });

  const GREP_FORMS = [
    'file grep TODO',
    'file grep',
    'file grep --limit',
    'file grep [unclosed',
    'FILE GREP TODO',
    '  file\tgrep TODO  ',
    '/file grep TODO',
    '  /FiLe   GrEp   TODO  ',
  ];

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('refuses agent file grep commands when %s', (_label, grants) => {
    for (const command of GREP_FORMS) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({
        refusal: `Agent: command not permitted: ${command}.`,
      });
    }
  });

  it.each([
    ['web granted', ['web']],
    ['file granted', ['file']],
    ['ungranted', []],
  ])('refuses agent web lines when %s', (_label, grants) => {
    for (const command of [
      'web search node.js', 'web', 'web foo', 'WEB SEARCH x', '/web search x',
      'web fetch https://x', 'WEB FETCH x', '/web fetch https://x',
    ]) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({
        refusal: `Agent: command not permitted: ${command}.`,
      });
    }
  });

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('routes file greps and file grep-x to the caller when %s', (_label, grants) => {
    for (const command of ['file greps x', 'file grep-x x']) {
      expect(gateCommand(agent({ grants }), [], command)).toStrictEqual({ runsOn: 'caller' });
    }
  });

  it.each([
    ['granted', ['file'], { runsOn: 'workspace' }],
    ['ungranted', [], { refusal: 'Agent: command not permitted: /FILE READ a.md.' }],
  ] as const)('keeps the read boundary beside the grep refusal when %s', (_label, grants, expected) => {
    expect(gateCommand(agent({ grants }), [], '/FILE READ a.md')).toStrictEqual(expected);
  });

  it('keeps file read and non-mutation routing beside the mutation refusal', () => {
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file read a.md')).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(agent(), [], 'file read a.md')).toStrictEqual({
      refusal: 'Agent: command not permitted: file read a.md.',
    });
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file writer x')).toStrictEqual({ runsOn: 'caller' });
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file patching x')).toStrictEqual({ runsOn: 'caller' });
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file globs x')).toStrictEqual({ runsOn: 'caller' });
    expect(gateCommand(agent({ grants: ['file'] }), [], 'db sqlite list')).toStrictEqual({ runsOn: 'caller' });
  });

  it('ignores the tool list for an agent snapshot', () => {
    expect(gateCommand(agent(), gateTools, 'db sqlite query select 1')).toStrictEqual({ runsOn: 'caller' });
    expect(() => gateCommand(agent(), gateTools, 'select 1')).not.toThrow();
    expect(gateCommand(agent(), gateTools, 'select 1')).toStrictEqual({ runsOn: 'caller' });
  });

  it('decides the same way twice from a deep-frozen agent snapshot', () => {
    const snapshot = Object.freeze(agent({ grants: Object.freeze(['file']) }));
    const first = gateCommand(snapshot, [], 'file read a.md');
    expect(gateCommand(snapshot, [], 'file read a.md')).toStrictEqual(first);
    expect(gateCommand(snapshot, [], 'db sqlite list')).toStrictEqual({ runsOn: 'caller' });
  });
});

describe('toolExtractor', () => {
  it('returns the command line a tool recognizes', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('Let me look.\nbrowser goto x')).toBe('browser goto x');
    expect(toolExtractor(tools)('I need to ask.\nquestion ask x')).toBe('question ask x');
  });

  it('recognizes a database line through isDatabaseCommandLine', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('Checking.\ndb sqlite list')).toBe('db sqlite list');
    expect(toolExtractor(tools)('Checking.\ndb sqlite bogus')).toBeNull();
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

  it('finds a trailing file read case-insensitively when the file entry is granted', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('Let me read it.\nfile read notes/a.md')).toBe('file read notes/a.md');
    expect(toolExtractor(tools)('Let me read it.\nFile Read a.md')).toBe('File Read a.md');
  });

  it('returns null for a trailing file read on a table without the file entry', () => {
    const { tools } = setup(['browser goto', 'db sqlite list']);
    expect(toolExtractor(tools)('Let me read it.\nfile read')).toBeNull();
  });

  it('finds a trailing file glob on a table granting file glob', () => {
    const { tools } = setup(['file glob']);
    expect(toolExtractor(tools)('Let me look.\nfile glob **/*.ts')).toBe('file glob **/*.ts');
  });

  it('returns null for a trailing file glob on a table without the file entry', () => {
    const { tools } = setup(['browser goto', 'db sqlite list']);
    expect(toolExtractor(tools)('Let me look.\nfile glob **/*.ts')).toBeNull();
  });

  it('still extracts a trailing file glob on a table granting only file read', () => {
    const { tools } = setup(['file read']);
    expect(toolExtractor(tools)('Let me look.\nfile glob **/*.ts')).toBe('file glob **/*.ts');
  });

  it('extracts a trailing web search line in lowercase, backticks, or bare', () => {
    const { tools } = setup(['web search']);
    expect(toolExtractor(tools)('Let me look.\nweb search node.js lts')).toBe('web search node.js lts');
    expect(toolExtractor(tools)('`web search x`')).toBe('web search x');
    expect(toolExtractor(tools)('web search')).toBe('web search');
  });

  it('skips a capitalized web sentence and keeps an earlier web search line', () => {
    const { tools } = setup(['web search']);
    expect(toolExtractor(tools)('web search x\nWeb search found three results.')).toBe('web search x');
    expect(toolExtractor(tools)('Web search found three results.')).toBeNull();
    expect(toolExtractor(tools)('WEB SEARCH x')).toBeNull();
    expect(toolExtractor(tools)('web searching x')).toBeNull();
  });

  it('returns null for a trailing web search line on a table without the web entry', () => {
    const { tools } = setup(['file read']);
    expect(toolExtractor(tools)('web search x')).toBeNull();
  });

  it('extracts a web fetch line from a reply when only web search is granted', () => {
    const { tools } = setup(['web search']);
    expect(toolExtractor(tools)('Let me read it.\nweb fetch https://example.com')).toBe('web fetch https://example.com');
    expect(toolExtractor(tools)('web fetch')).toBe('web fetch');
  });

  it('extracts a web search line from a reply when only web fetch is granted', () => {
    const { tools } = setup(['web fetch']);
    expect(toolExtractor(tools)('Let me look.\nweb search x')).toBe('web search x');
  });

  it('does not extract a capitalized, uppercased, or near-miss web fetch sentence', () => {
    const { tools } = setup(['web fetch']);
    const extract = toolExtractor(tools);
    expect(extract('Web fetch returned the page.')).toBeNull();
    expect(extract('WEB FETCH https://x')).toBeNull();
    expect(extract('web fetcher x')).toBeNull();
    expect(extract('web fetch https://x\nWeb fetch returned the page.')).toBe('web fetch https://x');
  });

  it('returns null for a trailing web fetch line on a table without a web command', () => {
    const { tools } = setup(['file read']);
    expect(toolExtractor(tools)('web fetch https://x')).toBeNull();
  });

  it('returns a granted command, since the table reads no settings', () => {
    const { tools } = setup(['browser goto']);
    expect(toolExtractor(tools)('Let me look.\nbrowser goto x')).toBe('browser goto x');
  });

  it('returns null when no line is a command', () => {
    const { tools } = setup();
    expect(toolExtractor(tools)('here is the final answer')).toBeNull();
    expect(toolExtractor(tools)('browser open https://example.com')).toBeNull();
  });
});

describe('file mutation tools', () => {
  const fileTool = (grants: readonly string[]) => createAcpToolTable(grants).find((tool) => tool.runsOn === 'workspace');

  it('selects the file tool for any file grant', () => {
    for (const grant of ['file read', 'file glob', 'file write', 'file edit', 'file patch']) expect(fileTool([grant])).toBeDefined();
    expect(fileTool(['browser goto'])).toBeUndefined();
  });

  it('includes mutation primer text only when a mutation is granted', () => {
    expect(fileTool(['file read'])!.primer).toBe(FILE_READ_PRIMER);
    expect(fileTool(['file write'])!.primer).toBe(FILE_MUTATION_PRIMER);
    expect(fileTool(['file read', 'file edit'])!.primer).toBe(`${FILE_READ_PRIMER}\n\n${FILE_MUTATION_PRIMER}`);
  });

  it('includes glob primer text only when file glob is granted, between read and mutation', () => {
    expect(fileTool(['file glob'])!.primer).toBe(FILE_GLOB_PRIMER);
    expect(fileTool(['file read', 'file glob', 'file edit'])!.primer)
      .toBe(`${FILE_READ_PRIMER}\n\n${FILE_GLOB_PRIMER}\n\n${FILE_MUTATION_PRIMER}`);
    expect(fileTool(['file read'])!.primer).not.toContain(FILE_GLOB_PRIMER);
  });

  it('gives a grant of only file edit the file tool with no read text', () => {
    const primer = fileTool(['file edit'])!.primer;
    expect(primer).not.toContain(FILE_READ_PRIMER);
    expect(primer).toContain('file edit');
  });

  it('extracts a trailing file write and a malformed file edit', () => {
    const extract = toolExtractor(createAcpToolTable(['file write', 'file edit']));
    expect(extract('Writing.\nfile write {"path":"a.md","content":"x"}')).toBe('file write {"path":"a.md","content":"x"}');
    expect(extract('Editing.\nfile edit {')).toBe('file edit {');
  });

  it('gives a patch-only grant the file owner with exactly the patch primer', () => {
    const tool = fileTool(['file patch']);
    expect(tool).toBeDefined();
    expect(tool!.primer).toBe(FILE_PATCH_PRIMER);
    expect(tool!.primer).not.toContain(FILE_MUTATION_PRIMER);
  });

  it('appends the patch primer after the mutation primer with one mutation fragment', () => {
    const primer = fileTool(['file read', 'file glob', 'file grep', 'file write', 'file edit', 'file patch'])!.primer;
    expect(primer).toBe([
      FILE_READ_PRIMER, FILE_GLOB_PRIMER, FILE_GREP_PRIMER, FILE_MUTATION_PRIMER, FILE_PATCH_PRIMER,
    ].join('\n\n'));
    expect(primer.split(FILE_MUTATION_PRIMER)).toHaveLength(2);
  });

  it('follows the grep primer with the patch primer when only a patch mutation is granted', () => {
    const primer = fileTool(['file read', 'file glob', 'file grep', 'file patch'])!.primer;
    expect(primer).toBe(`${FILE_READ_PRIMER}\n\n${FILE_GLOB_PRIMER}\n\n${FILE_GREP_PRIMER}\n\n${FILE_PATCH_PRIMER}`);
    expect(primer).not.toContain(FILE_MUTATION_PRIMER);
  });

  it('omits the patch primer when only write and edit are granted', () => {
    expect(fileTool(['file write', 'file edit'])!.primer).not.toContain(FILE_PATCH_PRIMER);
  });

  const coreSnapshot = (grants: readonly string[], rows: AcpRunSnapshotRow[] = []): AcpRunSnapshot => ({
    kind: 'core', role: 'tell', roleName: 'writer', grants, rows, withoutTools: false,
  });
  const write = 'file write {"path":"a.md","content":"x"}';
  const edit = 'file edit {"path":"a.md","oldString":"x","newString":"y"}';

  it('refuses an ungranted mutation', () => {
    const tools = createAcpToolTable(['file read']);
    expect(gateCommand(coreSnapshot(['file read']), tools, write)).toStrictEqual({
      refusal: 'Command not allowed for role "writer": file write.',
    });
  });

  it('refuses a disabled file write and an agent-inaccessible file edit', () => {
    const grants = ['file write', 'file edit'];
    const tools = createAcpToolTable(grants);
    const rows = [
      { name: 'file write', effectiveEnabled: false, effectiveAgentAccess: true },
      { name: 'file edit', effectiveEnabled: true, effectiveAgentAccess: false },
    ];
    expect(gateCommand(coreSnapshot(grants, rows), tools, write)).toStrictEqual({
      refusal: 'Command is disabled: file write.', refused: 'disabled',
    });
    expect(gateCommand(coreSnapshot(grants, rows), tools, edit)).toStrictEqual({
      refusal: 'Command is disabled: file edit.', refused: 'disabled',
    });
  });

  it('routes a granted mutation to the workspace', () => {
    const grants = ['file write', 'file edit'];
    const tools = createAcpToolTable(grants);
    expect(gateCommand(coreSnapshot(grants), tools, write)).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(coreSnapshot(grants), tools, edit)).toStrictEqual({ runsOn: 'workspace' });
  });

  it('refuses an ungranted file glob', () => {
    const tools = createAcpToolTable(['file read']);
    expect(gateCommand(coreSnapshot(['file read']), tools, 'file glob x')).toStrictEqual({
      refusal: 'Command not allowed for role "writer": file glob.',
    });
  });

  it('refuses a disabled file glob', () => {
    const grants = ['file glob'];
    const rows = [{ name: 'file glob', effectiveEnabled: false, effectiveAgentAccess: true }];
    expect(gateCommand(coreSnapshot(grants, rows), createAcpToolTable(grants), 'file glob x')).toStrictEqual({
      refusal: 'Command is disabled: file glob.', refused: 'disabled',
    });
  });

  it('routes a granted file glob to the workspace', () => {
    const grants = ['file glob'];
    expect(gateCommand(coreSnapshot(grants), createAcpToolTable(grants), 'file glob x')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('routes a granted web search to the workspace', () => {
    const grants = ['web search'];
    expect(gateCommand(coreSnapshot(grants), createAcpToolTable(grants), 'web search x')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('refuses a disabled web search and an agent-inaccessible one', () => {
    const grants = ['web search'];
    const tools = createAcpToolTable(grants);
    const disabled = [{ name: 'web search', effectiveEnabled: false, effectiveAgentAccess: true }];
    const agentOff = [{ name: 'web search', effectiveEnabled: true, effectiveAgentAccess: false }];
    expect(gateCommand(coreSnapshot(grants, disabled), tools, 'web search x')).toStrictEqual({
      refusal: 'Command is disabled: web search.', refused: 'disabled',
    });
    expect(gateCommand(coreSnapshot(grants, agentOff), tools, 'web search x')).toStrictEqual({
      refusal: 'Command is disabled: web search.', refused: 'disabled',
    });
  });

  it('refuses an ungranted web search by role', () => {
    expect(gateCommand(coreSnapshot(['file read']), createAcpToolTable(['web search']), 'web search x')).toStrictEqual({
      refusal: 'Command not allowed for role "writer": web search.',
    });
  });

  it('routes a granted web fetch to the workspace', () => {
    const grants = ['web fetch'];
    expect(gateCommand(coreSnapshot(grants), createAcpToolTable(grants), 'web fetch https://x')).toStrictEqual({ runsOn: 'workspace' });
  });

  it('refuses a web fetch the role did not grant and a web search it did not grant', () => {
    expect(gateCommand(coreSnapshot(['web search']), createAcpToolTable(['web search']), 'web fetch https://x')).toStrictEqual({
      refusal: 'Command not allowed for role "writer": web fetch.',
    });
    expect(gateCommand(coreSnapshot(['web fetch']), createAcpToolTable(['web fetch']), 'web search x')).toStrictEqual({
      refusal: 'Command not allowed for role "writer": web search.',
    });
  });

  it('refuses a disabled or agent-inaccessible web fetch before the role check', () => {
    const tools = createAcpToolTable(['web fetch', 'web search']);
    const disabled = [{ name: 'web fetch', effectiveEnabled: false, effectiveAgentAccess: true }];
    const agentOff = [{ name: 'web fetch', effectiveEnabled: true, effectiveAgentAccess: false }];
    for (const rows of [disabled, agentOff]) {
      expect(gateCommand(coreSnapshot(['web fetch'], rows), tools, 'web fetch https://x')).toStrictEqual({
        refusal: 'Command is disabled: web fetch.', refused: 'disabled',
      });
      expect(gateCommand(coreSnapshot(['web search'], rows), tools, 'web fetch https://x')).toStrictEqual({
        refusal: 'Command is disabled: web fetch.', refused: 'disabled',
      });
    }
  });

  const patch = 'file patch {"patchText":"*** Delete File: old.txt"}';

  it('refuses a disabled file patch before the role check, granted or not', () => {
    const tools = createAcpToolTable(['file patch']);
    const rows = [{ name: 'file patch', effectiveEnabled: false, effectiveAgentAccess: true }];
    expect(gateCommand(coreSnapshot(['file patch'], rows), tools, patch)).toStrictEqual({
      refusal: 'Command is disabled: file patch.', refused: 'disabled',
    });
    expect(gateCommand(coreSnapshot(['file read'], rows), tools, patch)).toStrictEqual({
      refusal: 'Command is disabled: file patch.', refused: 'disabled',
    });
  });

  it('refuses an ungranted file patch and routes a granted one to the workspace', () => {
    expect(gateCommand(coreSnapshot(['file read']), createAcpToolTable(['file read']), patch)).toStrictEqual({
      refusal: 'Command not allowed for role "writer": file patch.',
    });
    expect(gateCommand(coreSnapshot(['file patch']), createAcpToolTable(['file patch']), patch))
      .toStrictEqual({ runsOn: 'workspace' });
  });

  it('extracts a trailing and a malformed patch line, but not without a file grant', () => {
    const extract = toolExtractor(createAcpToolTable(['file patch']));
    expect(extract('Patching.\nfile patch {"patchText":"*** Delete File: old.txt"}'))
      .toBe('file patch {"patchText":"*** Delete File: old.txt"}');
    expect(extract('Patching.\nfile patch {')).toBe('file patch {');
    expect(toolExtractor(createAcpToolTable(['db sqlite list']))('Patching.\nfile patch {"patchText":"x"}')).toBeNull();
  });
});

describe('file grep tools', () => {
  const fileTool = (grants: readonly string[]) => createAcpToolTable(grants).find((tool) => tool.runsOn === 'workspace');

  it('adds no file tool without a file grant', () => {
    expect(fileTool(['browser goto', 'db sqlite list'])).toBeUndefined();
  });

  it('gives a grep-only grant the file owner with only the grep primer', () => {
    const tool = fileTool(['file grep']);
    expect(tool).toBeDefined();
    expect(tool!.primer).toBe(FILE_GREP_PRIMER);
    expect(tool!.primer).not.toContain(FILE_READ_PRIMER);
    expect(tool!.primer).not.toContain(FILE_GLOB_PRIMER);
    expect(tool!.primer).not.toContain(FILE_MUTATION_PRIMER);
  });

  it.each([
    ['read only', ['file read'], FILE_READ_PRIMER],
    ['glob only', ['file glob'], FILE_GLOB_PRIMER],
    ['write only', ['file write'], FILE_MUTATION_PRIMER],
    ['edit only', ['file edit'], FILE_MUTATION_PRIMER],
  ])('keeps the %s primer unchanged', (_label, grants, primer) => {
    expect(fileTool(grants)!.primer).toBe(primer);
  });

  it('joins read and grep with exactly two newlines and omits the others', () => {
    const primer = fileTool(['file read', 'file grep'])!.primer;
    expect(primer).toBe(`${FILE_READ_PRIMER}\n\n${FILE_GREP_PRIMER}`);
    expect(primer).not.toContain(FILE_GLOB_PRIMER);
    expect(primer).not.toContain(FILE_MUTATION_PRIMER);
  });

  it('places grep after glob with exactly two newlines between them', () => {
    expect(fileTool(['file glob', 'file grep'])!.primer).toBe(`${FILE_GLOB_PRIMER}\n\n${FILE_GREP_PRIMER}`);
  });

  it('places grep before a single mutation fragment when a mutation is granted beside it', () => {
    expect(fileTool(['file grep', 'file write'])!.primer).toBe(`${FILE_GREP_PRIMER}\n\n${FILE_MUTATION_PRIMER}`);
    expect(fileTool(['file grep', 'file edit'])!.primer).toBe(`${FILE_GREP_PRIMER}\n\n${FILE_MUTATION_PRIMER}`);
  });

  it('keeps one mutation fragment and the canonical file order for all five grants', () => {
    const primer = fileTool(['file read', 'file glob', 'file grep', 'file write', 'file edit'])!.primer;
    expect(primer).toBe([
      FILE_READ_PRIMER, FILE_GLOB_PRIMER, FILE_GREP_PRIMER, FILE_MUTATION_PRIMER,
    ].join('\n\n'));
    expect(primer.indexOf(FILE_GREP_PRIMER)).toBeGreaterThan(primer.indexOf(FILE_GLOB_PRIMER));
    expect(primer.indexOf(FILE_GREP_PRIMER)).toBeLessThan(primer.indexOf(FILE_MUTATION_PRIMER));
    expect(primer.split(FILE_MUTATION_PRIMER)).toHaveLength(2);
  });
});

describe('file grep extraction', () => {
  const extract = (grants: readonly string[]) => toolExtractor(createAcpToolTable(grants));

  it('extracts a valid flags-first grep through a file-read-only owner', () => {
    expect(extract(['file read'])('Looking.\nfile grep --literal --path src TODO'))
      .toBe('file grep --literal --path src TODO');
  });

  it('extracts a bare grep and a malformed flags line', () => {
    expect(extract(['file grep'])('Checking.\nfile grep')).toBe('file grep');
    expect(extract(['file grep'])('Checking.\nfile grep --limit')).toBe('file grep --limit');
  });

  it('keeps case and repeated inter-keyword whitespace while preserving pattern spacing', () => {
    expect(extract(['file grep'])('Looking.\n  FiLe \t  GrEp   two   words  ')).toBe('FiLe \t  GrEp   two   words');
  });

  it('cleans fences and common prompt prefixes before extracting grep', () => {
    expect(extract(['file grep'])('Looking.\n```\n> file grep TODO\n```')).toBe('file grep TODO');
  });

  it('picks the last recognized command line', () => {
    expect(extract(['file glob', 'file grep'])('file grep one\nnotes\nfile glob *.ts')).toBe('file glob *.ts');
  });

  it('does not extract file greps or file grep-x', () => {
    expect(extract(['file read'])('file greps x')).toBeNull();
    expect(extract(['file read'])('file grep-x x')).toBeNull();
  });

  it('does not extract grep when the file owner is omitted', () => {
    expect(extract(['browser goto', 'db sqlite list'])('file grep TODO')).toBeNull();
  });
});

describe('file grep gate', () => {
  const snapshot = (grants: readonly string[], rows: AcpRunSnapshotRow[] = []): AcpRunSnapshot => ({
    kind: 'core', role: 'tell', roleName: 'writer', grants, rows, withoutTools: false,
  });
  const GREP = 'file grep TODO';
  const toolsFor = (grants: readonly string[]) => createAcpToolTable(grants);

  it('allows a granted grep with no settings row', () => {
    const grants = ['file grep'];
    expect(gateCommand(snapshot(grants), toolsFor(grants), GREP)).toStrictEqual({ runsOn: 'workspace' });
  });

  it('allows a granted grep whose row is enabled with agent access', () => {
    const grants = ['file grep'];
    const rows = [{ name: 'file grep', effectiveEnabled: true, effectiveAgentAccess: true }];
    expect(gateCommand(snapshot(grants, rows), toolsFor(grants), GREP)).toStrictEqual({ runsOn: 'workspace' });
  });

  it('refuses an enabled ungranted grep beside a file-read-only owner', () => {
    const grants = ['file read'];
    expect(gateCommand(snapshot(grants), toolsFor(grants), GREP)).toStrictEqual({
      refusal: 'Command not allowed for role "writer": file grep.',
    });
  });

  it.each([
    ['disabled granted', ['file grep'], { effectiveEnabled: false, effectiveAgentAccess: true }],
    ['agent-off granted', ['file grep'], { effectiveEnabled: true, effectiveAgentAccess: false }],
    ['disabled ungranted', ['file read'], { effectiveEnabled: false, effectiveAgentAccess: true }],
    ['agent-off ungranted', ['file read'], { effectiveEnabled: true, effectiveAgentAccess: false }],
  ] as const)('refuses %s grep before the role check', (_label, grants, setting) => {
    const rows = [{ name: 'file grep', ...setting }];
    expect(gateCommand(snapshot(grants, rows), toolsFor(grants), GREP)).toStrictEqual({
      refusal: 'Command is disabled: file grep.', refused: 'disabled',
    });
  });
});

describe('subagent tool', () => {
  const LINE = 'subagent --role research --task t.md';
  const toolsFor = (grants: readonly string[]) => createAcpToolTable(grants);
  const snapshot = (grants: readonly string[], rows: AcpRunSnapshotRow[] = []): AcpRunSnapshot => ({
    kind: 'core', role: 'tell', roleName: 'writer', grants, rows, withoutTools: false,
  });

  it('declares one granted caller entry before the database entry with the exact primer', () => {
    const tools = toolsFor(['subagent', 'db sqlite list']);
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ primer: SUBAGENT_PRIMER, runsOn: 'caller' });
    expect(tools[0].match(LINE)).toBe(true);
    expect(tools[0].isCommandLine('  SUBAGENT {"role":')).toBe(true);
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(toolPrimer(tools, ['subagent', 'db sqlite list'])).toBe(
      `${SUBAGENT_PRIMER}\n\n${DB_PRIMER}\n\nOnly these commands are allowed: db sqlite list, subagent.`,
    );
    expect(toolPrimer(tools, ['subagent', 'db sqlite list']).split(SUBAGENT_PRIMER)).toHaveLength(2);
  });

  it('extracts a bare, wrong-flag, and malformed-JSON subagent line before policy validates it', () => {
    const extract = toolExtractor(toolsFor(['subagent']));
    expect(extract('Thinking.\nsubagent')).toBe('subagent');
    expect(extract('Thinking.\nsubagent --bogus x')).toBe('subagent --bogus x');
    expect(extract('Thinking.\nsubagent {"role":')).toBe('subagent {"role":');
  });

  it('omits the entry, primer, and extraction when subagent is not granted', () => {
    const tools = toolsFor(['browser goto', 'db sqlite list']);
    expect(tools.some((tool) => tool.primer === SUBAGENT_PRIMER)).toBe(false);
    expect(toolPrimer(tools, ['subagent'])).not.toContain(SUBAGENT_PRIMER);
    expect(toolExtractor(tools)(LINE)).toBeNull();
  });

  it('selects the last recognized command across mixed database and subagent reply lines', () => {
    const extract = toolExtractor(toolsFor(['subagent', 'db sqlite list']));
    expect(extract(`db sqlite list\n${LINE}`)).toBe(LINE);
    expect(extract(`${LINE}\ndb sqlite list`)).toBe('db sqlite list');
  });

  it('refuses a subagent command whose Enabled setting is off', () => {
    const grants = ['subagent'];
    const rows = [{ name: 'subagent', effectiveEnabled: false, effectiveAgentAccess: true }];
    expect(gateCommand(snapshot(grants, rows), toolsFor(grants), LINE)).toStrictEqual({
      refusal: 'Command is disabled: subagent.', refused: 'disabled',
    });
  });

  it('refuses a subagent command whose Agent access is off', () => {
    const grants = ['subagent'];
    const rows = [{ name: 'subagent', effectiveEnabled: true, effectiveAgentAccess: false }];
    expect(gateCommand(snapshot(grants, rows), toolsFor(grants), LINE)).toStrictEqual({
      refusal: 'Command is disabled: subagent.', refused: 'disabled',
    });
  });

  it('runs a granted subagent command with no settings row on the caller side', () => {
    const grants = ['subagent'];
    expect(gateCommand(snapshot(grants), toolsFor(grants), LINE)).toStrictEqual({ runsOn: 'caller' });
  });
});

describe('notify tool', () => {
  const LINE = 'notify Build finished';
  const toolsFor = (grants: readonly string[]) => createAcpToolTable(grants);
  const snapshot = (grants: readonly string[], rows: AcpRunSnapshotRow[] = []): AcpRunSnapshot => ({
    kind: 'core', role: 'tell', roleName: 'writer', grants, rows, withoutTools: false,
  });

  it('declares one granted caller entry before the database entry with the exact primer', () => {
    const tools = toolsFor(['notify', 'db sqlite list']);
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ primer: NOTIFY_PRIMER, runsOn: 'caller' });
    expect(tools[0].match(LINE)).toBe(true);
    expect(tools[0].isCommandLine('  NOTIFY Hello')).toBe(true);
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(toolPrimer(tools, ['notify', 'db sqlite list'])).toBe(
      `${NOTIFY_PRIMER}\n\n${DB_PRIMER}\n\nOnly these commands are allowed: db sqlite list, notify.`,
    );
    expect(toolPrimer(tools, ['notify', 'db sqlite list']).split(NOTIFY_PRIMER)).toHaveLength(2);
  });

  it('omits the entry, primer, and extraction when notify is not granted', () => {
    const tools = toolsFor(['browser goto', 'db sqlite list']);
    expect(tools.some((tool) => tool.primer === NOTIFY_PRIMER)).toBe(false);
    expect(toolPrimer(tools, ['notify'])).not.toContain(NOTIFY_PRIMER);
    expect(toolExtractor(tools)(LINE)).toBeNull();
  });

  it('extracts a trailing notify line but not a near-miss', () => {
    const extract = toolExtractor(toolsFor(['notify']));
    expect(extract('Working.\nnotify Build finished')).toBe(LINE);
    expect(extract('Working.\nnotifies Build finished')).toBeNull();
    expect(extract('Working.\nnotify-x Build')).toBeNull();
  });

  it('refuses an ungranted notify command with the role name', () => {
    const grants = ['browser goto'];
    expect(gateCommand(snapshot(grants), toolsFor(['notify', 'browser goto']), LINE)).toStrictEqual({
      refusal: 'Command not allowed for role "writer": notify.',
    });
  });

  it('refuses a granted notify command whose Enabled setting is off', () => {
    const grants = ['notify'];
    const rows = [{ name: 'notify', effectiveEnabled: false, effectiveAgentAccess: true }];
    expect(gateCommand(snapshot(grants, rows), toolsFor(grants), LINE)).toStrictEqual({
      refusal: 'Command is disabled: notify.', refused: 'disabled',
    });
  });

  it('runs a granted notify command with no settings row on the caller side', () => {
    const grants = ['notify'];
    expect(gateCommand(snapshot(grants), toolsFor(grants), LINE)).toStrictEqual({ runsOn: 'caller' });
  });
});
