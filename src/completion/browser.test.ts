import { describe, expect, it } from 'vitest';
import { completeBrowserCommand } from './browser.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { readCompletionCursor } from './cursor.js';
import { listApplicationCommands } from '../application-commands.js';

const at = (line: string) => readCompletionCursor(line, line.length);

function policyWith(disabled: readonly string[]): CompletionPolicy {
  const commands = listApplicationCommands().map((row) => ({
    ...row,
    enabled: true,
    agentAccess: true,
    effectiveEnabled: !disabled.includes(row.name),
    effectiveAgentAccess: !disabled.includes(row.name),
  }));
  return completionPolicy({ commands, source: 'default', path: '' });
}

describe('completeBrowserCommand', () => {
  const connections = ['browser:w1', 'browser:w2'];

  it('filters a disabled native child while keeping enabled siblings', () => {
    const policy = policyWith(['browser content']);

    expect(completeBrowserCommand(at('browser c'), connections, policy)?.newInput).toBe('browser close ');
    const all = completeBrowserCommand(at('browser '), connections, policy)?.matches ?? [];
    expect(all).not.toContain('content');
    expect(all).toContain('goto');
    expect(all).toContain('use');
  });

  it('leaves window id completion unchanged', () => {
    const policy = policyWith(['browser content']);

    expect(completeBrowserCommand(at('browser use '), connections, policy)?.matches).toEqual(['w1', 'w2']);
    expect(completeBrowserCommand(at('browser window close '), connections, policy)?.matches).toEqual(['w1', 'w2']);
  });

  it('returns null for another command', () => {
    expect(completeBrowserCommand(at('tab '), connections, policyWith([]))).toBeNull();
  });
});
