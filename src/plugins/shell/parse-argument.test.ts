import { describe, expect, it } from 'vitest';
import { SHELL_USAGE, parseShellArgument } from './parse-argument.js';

describe('parseShellArgument', () => {
  it('asks for a workspace by default, with no name and no offline mode', () => {
    expect(parseShellArgument('')).toEqual({ name: '', workspace: true, offline: false });
  });

  it('confirms the default with -w or --workspace, matched case-insensitively', () => {
    for (const flag of ['-w', '--workspace', '-W', '--WorkSpace']) {
      expect(parseShellArgument(flag)).toEqual({ name: '', workspace: true, offline: false });
    }
  });

  it('opts out with --no-workspace, which wins over -w wherever it appears', () => {
    expect(parseShellArgument('--no-workspace')).toMatchObject({ workspace: false });
    expect(parseShellArgument('-w --NO-WORKSPACE')).toMatchObject({ workspace: false });
    expect(parseShellArgument('--no-workspace --workspace')).toMatchObject({ workspace: false });
  });

  it('reads --offline whether or not there is a workspace', () => {
    expect(parseShellArgument('--Offline')).toEqual({ name: '', workspace: true, offline: true });
    expect(parseShellArgument('--offline --no-workspace')).toEqual({ name: '', workspace: false, offline: true });
  });

  it('joins the remaining words into a lowercased name, around the flags', () => {
    expect(parseShellArgument('Docs  Review --offline Two')).toEqual({ name: 'docs review two', workspace: true, offline: true });
  });

  it('lifts the address out wherever `on` appears and preserves its case', () => {
    expect(parseShellArgument('docs on DevBox:~/Work --offline')).toEqual({
      name: 'docs', workspace: true, offline: true, remote: 'DevBox:~/Work',
    });
    expect(parseShellArgument('on devbox --no-workspace')).toEqual({
      name: '', workspace: true, offline: false, remote: 'devbox',
    });
    expect(parseShellArgument('--no-workspace on')).toEqual({
      name: '', workspace: true, offline: false, remote: '',
    });
  });

  it('parses a named or numeric group selector anywhere among the launch words', () => {
    expect(parseShellArgument('Docs in group Review --offline')).toEqual({
      name: 'docs', workspace: true, offline: true, group: 'Review',
    });
    expect(parseShellArgument('in group 4 --no-workspace')).toEqual({
      name: '', workspace: false, offline: false, group: '4',
    });
  });

  it('rejects a missing or invalid group selector', () => {
    expect(parseShellArgument('in group')).toEqual({ error: `Invalid group name or ID. ${SHELL_USAGE}` });
    expect(parseShellArgument('in group 0')).toEqual({ error: `Invalid group name or ID. ${SHELL_USAGE}` });
  });

  it('refuses an unknown option with the usage line', () => {
    expect(parseShellArgument('docs --sandbox')).toEqual({ error: `Unknown option "--sandbox". ${SHELL_USAGE}` });
    expect(parseShellArgument('-x')).toEqual({ error: `Unknown option "-x". ${SHELL_USAGE}` });
    expect(SHELL_USAGE).toBe('Usage: shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>] [in group <name|id>]');
  });
});
