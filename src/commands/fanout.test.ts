import { describe, it, expect, vi } from 'vitest';
import { command } from './fanout.js';
import type { Managers } from '../managers.js';
import type { FanoutOutcome } from '../multiagent/manager.js';
import type { Tab } from '../tab/types.js';

const from = { label: 'me', index: 0 } as Tab;

function makeManagers(run: (label: string, input: string) => FanoutOutcome) {
  const append = vi.fn();
  const managers = { tab: { append }, multiAgent: { run } } as unknown as Managers;
  return { managers, append };
}

const started = (overrides: Partial<Extract<FanoutOutcome, { label: string }>> = {}): FanoutOutcome => ({
  label: 'multi-agent', running: 2, skipped: [], ...overrides,
});

describe('fanout command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('fanout');
  });

  it('matches fanout commands in any case', () => {
    expect(command.match('fanout opencode:m go')).toBe(true);
    expect(command.match('FANOUT opencode:m go')).toBe(true);
  });

  it('does not match non-fanout input', () => {
    expect(command.match('fan outs')).toBe(false);
    expect(command.match('send fanout')).toBe(false);
  });

  it('reports the run in the issuing tab\'s transcript', () => {
    const { managers, append } = makeManagers(() => started());

    command.run('fanout opencode:a opencode:b go', from, managers);

    expect(append).toHaveBeenCalledWith('me', {
      input: 'fanout opencode:a opencode:b go',
      output: '→ Comparing 2 models in "multi-agent".',
    });
  });

  it('says how many members were refused without naming them again', () => {
    const { managers, append } = makeManagers(() => started({ running: 1, skipped: ['"x" is not an opencode model in the harness catalog.'] }));

    command.run('fanout opencode:a opencode:x go', from, managers);

    expect(append).toHaveBeenCalledWith('me', expect.objectContaining({
      output: '→ Comparing 1 model in "multi-agent". 1 refused.',
    }));
  });

  // The parser owns the usage wording, so a malformed command reports what it said rather than
  // inventing a second message here — and provisions nothing on the way to finding that out.
  it('reports a usage error into the transcript and opens nothing', () => {
    const run = vi.fn(() => ({ error: 'Usage: fanout opencode:<model>... <prompt>' }) as FanoutOutcome);
    const { managers, append } = makeManagers(run);

    command.run('fanout no members here', from, managers);

    expect(append).toHaveBeenCalledWith('me', {
      input: 'fanout no members here',
      output: 'Usage: fanout opencode:<model>... <prompt>',
    });
  });

  // A run asked for as a `request` really does provision its workspaces; the reply is the summary,
  // because the caller will never read back a transcript entry written by another tab.
  it('answers a request with the run summary', () => {
    const reply = vi.fn();
    const { managers } = makeManagers(() => started({ running: 1 }));

    command.capture!('fanout opencode:a go', 'me', managers, reply);

    expect(reply).toHaveBeenCalledWith('Comparing 1 model in "multi-agent".');
  });

  it('answers a refused request with the reason', () => {
    const reply = vi.fn();
    const { managers } = makeManagers(() => ({ error: 'No fanout member can run: "x" is not an opencode model in the harness catalog.' }));

    command.capture!('fanout opencode:x go', 'me', managers, reply);

    expect(reply).toHaveBeenCalledWith('No fanout member can run: "x" is not an opencode model in the harness catalog.');
  });
});
