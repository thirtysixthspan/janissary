import { describe, it, expect } from 'vitest';
import { getOutput } from '../commands.js';
import { resolveCommand } from '../resolve.js';

// Every name `getOutput` used to answer `null` for. Each is a `Command` now, and both callers loop
// the registry before reaching `getOutput`, which is why those branches were deleted rather than
// carried forward. Asserting both halves — the classification the registry gives, and the fact that
// `getOutput` no longer special-cases the name — is what keeps the deletion honest.
const FORMERLY_SILENT = [
  ['clear', 'clear'],
  ['state', 'state'],
  ['hist', 'hist'],
  ['quit', 'quit'],
  ['exit', 'close'],
  ['close', 'close'],
  ['agent', 'agent'],
  ['agent Bob', 'agent'],
  ['msg bilal info hi', 'msg'],
  ['broadcast all info hi', 'broadcast'],
  ['acp summarize', 'acp'],
  ['db sqlite query mydb SELECT 1', 'db'],
  ['connection close sqlite:mydb', 'connection'],
  ['next', 'next'],
];

describe('getOutput', () => {
  it('returns help with commands and key bindings', () => {
    const result = getOutput('help');
    expect(result.kind).toBe('output');
    if (result.kind !== 'output') return;
    expect(result.text).toContain('Commands');
    expect(result.text).toContain('Key Bindings');
    expect(result.text).toContain('connection');
    expect(result.text).toContain('Ctrl+C');
  });

  it('is case insensitive', () => {
    const result = getOutput('HELP');
    expect(result.kind).toBe('output');
    if (result.kind === 'output') expect(result.text).toContain('Commands');
  });

  it.each([[''], [' '.repeat(3)]])('reports silent for empty input %#', (input) => {
    expect(getOutput(input)).toEqual({ kind: 'silent' });
  });

  it('reports unknown as a kind rather than in the message text', () => {
    const result = getOutput('foobar');
    expect(result.kind).toBe('unknown');
    if (result.kind !== 'unknown') return;
    expect(result.text).toContain('Unknown command');
    expect(result.text).toContain('foobar');
    expect(result.text).toContain('"help"');
  });

  it('reports unknown for gibberish', () => {
    expect(getOutput('xyzzy').kind).toBe('unknown');
  });

  it.each(FORMERLY_SILENT)('no longer special-cases %s, which the registry now answers', (input) => {
    expect(getOutput(input).kind).toBe('unknown');
  });

  it.each(FORMERLY_SILENT)('%s never reaches getOutput: the registry classifies it as %s', (input, name) => {
    expect(resolveCommand(input)).toEqual({ kind: 'app', name, cmd: input });
  });
});
