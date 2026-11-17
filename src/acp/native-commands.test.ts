import { describe, expect, it } from 'vitest';
import { isNativeCommand, nativeCommandName, nativeCommandTool } from './native-commands.js';
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
      'web search',
    ]);
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
    expect(nativeCommandName('websearch x')).toBeUndefined();
  });
});
