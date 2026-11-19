import { describe, expect, it } from 'vitest';
import { isNativeCommand, nativeCommandName, nativeCommandTool } from './native-commands.js';
import { createAcpToolTable } from './tool-table.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';

describe('native ACP commands', () => {
  it('publishes the ordered command vocabulary', () => {
    expect(NATIVE_ACP_COMMANDS).toEqual([
      'db sqlite create',
      'db sqlite delete',
      'db sqlite query',
      'db sqlite list',
      'browser goto',
      'browser content',
      'browser eval',
      'question ask',
      'question approve',
      'file read',
      'file glob',
      'file grep',
      'file write',
      'file edit',
      'file patch',
      'file list',
      'file stat',
      'file exists',
      'file head',
      'file tail',
      'web search',
      'web fetch',
      'subagent',
      'tab',
      'notify',
    ]);
  });

  it('appends notify once as the last ordered entry', () => {
    expect(NATIVE_ACP_COMMANDS.filter((command) => command === 'notify')).toHaveLength(1);
    expect(NATIVE_ACP_COMMANDS.at(-1)).toBe('notify');
    expect(NATIVE_ACP_COMMANDS.filter((command) => command === 'subagent')).toHaveLength(1);
  });

  it.each([
    ['db sqlite create', 'database'],
    ['db sqlite delete', 'database'],
    ['db sqlite query select 1', 'database'],
    ['db sqlite list', 'database'],
    ['browser goto https://example.test', 'browser'],
    ['browser content', 'browser'],
    ['browser eval document.title', 'browser'],
    ['question ask How are you?', 'question'],
    ['question approve 123', 'question'],
    ['file read notes/a.md', 'file'],
    ['file glob **/*.ts', 'file'],
    ['file grep', 'file'],
    ['file grep --literal TODO', 'file'],
    ['file patch {"patchText":"x"}', 'file'],
    ['web search node.js lts', 'web'],
    ['Web Search x', 'web'],
    ['web fetch https://example.com', 'web'],
    ['WEB FETCH x', 'web'],
    ['subagent', 'subagent'],
    ['subagent --role research --task t.md', 'subagent'],
    ['subagent {"role":"research","task":"t.md"}', 'subagent'],
    ['tab', 'tab'],
    ['tab focus notes', 'tab'],
    ['TAB DOCK "review notes" left', 'tab'],
    ['notify Build finished', 'notify'],
    ['NOTIFY Hello', 'notify'],
  ] as const)('assigns %s to %s, including trailing arguments', (command, tool) => {
    expect(nativeCommandTool(command)).toBe(tool);
    expect(isNativeCommand(command)).toBe(true);
    expect(nativeCommandName(command)).toBe(NATIVE_ACP_COMMANDS.find((candidate) => command.toLowerCase().startsWith(candidate)));
  });

  it('matches command words case-insensitively and returns the canonical vocabulary value', () => {
    expect(nativeCommandName('  BROWSER GOTO https://example.test  ')).toBe('browser goto');
    expect(nativeCommandTool('DB SQLITE QUERY store SELECT 1')).toBe('database');
    expect(nativeCommandName('  FILE   GREP\t--literal TODO  ')).toBe('file grep');
    expect(nativeCommandTool('FILE GREP')).toBe('file');
  });

  it('classifies malformed grep arguments by the command name', () => {
    expect(nativeCommandName('file grep [unclosed')).toBe('file grep');
    expect(nativeCommandTool('file grep --path')).toBe('file');
    expect(isNativeCommand('FILE grep --literal --')).toBe(true);
  });

  it('resolves a patch line with arguments in any case', () => {
    expect(nativeCommandName('file patch {"patchText":"x"}')).toBe('file patch');
    expect(nativeCommandName('  FILE  PATCH {…}')).toBe('file patch');
  });

  it('recognizes every native command through both the name recognizer and the tool table', () => {
    const tools = createAcpToolTable(NATIVE_ACP_COMMANDS);
    const fallThrough = tools.find((tool) => tool.match('anything at all'))!;
    expect(tools.filter((tool) => tool.match('anything at all'))).toEqual([fallThrough]);
    for (const name of NATIVE_ACP_COMMANDS) {
      expect(nativeCommandName(name)).toBe(name);
      const matched = tools.filter((tool) => tool.match(name));
      const owned = matched.filter((tool) => tool !== fallThrough);
      if (nativeCommandTool(name) === 'database') {
        expect(matched).toEqual([fallThrough]);
      } else {
        expect(owned).toHaveLength(1);
      }
    }
  });

  it('rejects near-miss commands in both recognizers apart from the database fall-through', () => {
    const tools = createAcpToolTable(NATIVE_ACP_COMMANDS);
    const recognizers = tools.filter((tool) => !tool.match('anything at all'));
    for (const nearMiss of [
      'browser gotofoo x', 'file greps x', 'web searching x', 'question unknown x', 'db sqlitex list x', 'notify-x Build', 'tabs focus notes',
    ]) {
      expect(nativeCommandName(nearMiss)).toBeUndefined();
      expect(recognizers.some((tool) => tool.match(nearMiss))).toBe(false);
    }
  });

  it('assigns malformed mixed-case subagent lines to the subagent owner', () => {
    expect(nativeCommandName('  SuBAgEnT\t--bogus  ')).toBe('subagent');
    expect(nativeCommandTool('SUBAGENT {"role":')).toBe('subagent');
    expect(nativeCommandTool('SuBAgEnT --role research')).toBe('subagent');
    expect(isNativeCommand('subagent --role')).toBe(true);
  });

  it('rejects unknown commands and words that only start with a native command', () => {
    expect(nativeCommandTool('browser gotofoo https://example.test')).toBeUndefined();
    expect(nativeCommandName('question unknown')).toBeUndefined();
    expect(nativeCommandTool('db sqlite')).toBeUndefined();
    expect(isNativeCommand('question unknown')).toBe(false);
    expect(nativeCommandName('file')).toBeUndefined();
    expect(nativeCommandName('file readme x')).toBeUndefined();
    expect(nativeCommandName('file globs x')).toBeUndefined();
    expect(nativeCommandName('file greps x')).toBeUndefined();
    expect(nativeCommandName('file grep-x x')).toBeUndefined();
    expect(nativeCommandName('files x')).toBeUndefined();
    expect(nativeCommandName('web')).toBeUndefined();
    expect(nativeCommandName('web searching x')).toBeUndefined();
    expect(nativeCommandName('web fetcher x')).toBeUndefined();
    expect(nativeCommandName('websearch x')).toBeUndefined();
    expect(nativeCommandName('subagents x')).toBeUndefined();
    expect(nativeCommandName('subagent-x x')).toBeUndefined();
    expect(nativeCommandTool('subagents --role r')).toBeUndefined();
    expect(isNativeCommand('subagent-x')).toBe(false);
  });
});
