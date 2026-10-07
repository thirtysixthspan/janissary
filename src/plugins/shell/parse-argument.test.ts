import { describe, expect, it } from 'vitest';
import { REMOTE_SHELL_REFUSAL, SHELL_USAGE, parseShellArgument } from './parse-argument.js';

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

  it('refuses `on <address>` and a bare `on`', () => {
    expect(parseShellArgument('docs on devbox')).toEqual({ error: REMOTE_SHELL_REFUSAL });
    expect(parseShellArgument('on')).toEqual({ error: REMOTE_SHELL_REFUSAL });
    expect(REMOTE_SHELL_REFUSAL).toBe('Remote shell tabs are not supported yet.');
  });

  it('refuses an unknown option with the usage line', () => {
    expect(parseShellArgument('docs --sandbox')).toEqual({ error: `Unknown option "--sandbox". ${SHELL_USAGE}` });
    expect(parseShellArgument('-x')).toEqual({ error: `Unknown option "-x". ${SHELL_USAGE}` });
    expect(SHELL_USAGE).toBe('Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline]');
  });
});
