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
      `${FILE_READ_PRIMER}\n\n${FILE_MUTATION_PRIMER}`,
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

  it('runs the file entry on the workspace and the others on the caller side', () => {
    const { tools } = setup();
    expect(tools.map((tool) => tool.runsOn)).toEqual(['caller', 'caller', 'workspace', 'caller']);
  });

  it('keeps the database entry last when it is included', () => {
    const { tools } = setup();
    expect(tools.at(-1)!.match('anything at all')).toBe(true);
    expect(tools.slice(0, -1).some((tool) => tool.match('anything at all'))).toBe(false);
    const file = tools.find((tool) => tool.runsOn === 'workspace')!;
    expect(file.match('anything at all')).toBe(false);
    expect(file.match('db sqlite list')).toBe(false);
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

  it.each(['file readme x', 'db sqlite list', 'question ask "x"'])(
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

  it('keeps file read and non-mutation routing beside the mutation refusal', () => {
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file read a.md')).toStrictEqual({ runsOn: 'workspace' });
    expect(gateCommand(agent(), [], 'file read a.md')).toStrictEqual({
      refusal: 'Agent: command not permitted: file read a.md.',
    });
    expect(gateCommand(agent({ grants: ['file'] }), [], 'file writer x')).toStrictEqual({ runsOn: 'caller' });
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
    for (const grant of ['file read', 'file write', 'file edit']) expect(fileTool([grant])).toBeDefined();
    expect(fileTool(['browser goto'])).toBeUndefined();
  });

  it('includes mutation primer text only when a mutation is granted', () => {
    expect(fileTool(['file read'])!.primer).toBe(FILE_READ_PRIMER);
    expect(fileTool(['file write'])!.primer).toBe(FILE_MUTATION_PRIMER);
    expect(fileTool(['file read', 'file edit'])!.primer).toBe(`${FILE_READ_PRIMER}\n\n${FILE_MUTATION_PRIMER}`);
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
});
