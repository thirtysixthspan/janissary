import { describe, expect, it } from 'vitest';
import type { AcpRunSnapshot, AcpRunSnapshotRow } from './types.js';
import { corePrimer } from './drive-loop.js';
import { createAcpToolTable } from './tool-table.js';
import { NO_BUILTIN_TOOLS_LINE, NO_TOOLS_LINE } from './internal-tools.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';
import { DB_PRIMER } from '../database/primer.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';

type CoreSnapshot = Extract<AcpRunSnapshot, { kind: 'core' }>;

function coreSnapshot(
  role: 'ask' | 'tell', grants: string[], rows: AcpRunSnapshotRow[] = [], withoutTools = false,
): CoreSnapshot {
  return { kind: 'core', role, roleName: role, grants, rows, withoutTools };
}

function primerFor(snapshot: CoreSnapshot): string {
  return corePrimer(snapshot, createAcpToolTable(snapshot.grants));
}

describe('corePrimer', () => {
  it('orders tool text, the tools line, the tell instruction, and Markdown for tell', () => {
    expect(primerFor(coreSnapshot('tell', ['db sqlite query']))).toBe([
      DB_PRIMER,
      'Only these commands are allowed: db sqlite query.',
      NO_BUILTIN_TOOLS_LINE,
      TELL_INSTRUCTION,
      MARKDOWN_INSTRUCTION,
    ].join('\n\n'));
  });

  it('does not give the ask role the tell instruction', () => {
    const result = primerFor(coreSnapshot('ask', ['db sqlite query']));
    expect(result).not.toContain(TELL_INSTRUCTION);
    expect(result.startsWith(DB_PRIMER)).toBe(true);
    expect(result.endsWith(MARKDOWN_INSTRUCTION)).toBe(true);
  });

  it('excludes an agent-off command from the allow-list but keeps its owner primer', () => {
    const result = primerFor(coreSnapshot('ask', ['browser goto', 'db sqlite query'], [
      { name: 'browser goto', effectiveEnabled: true, effectiveAgentAccess: false },
    ]));
    expect(result).toContain(BROWSER_PRIMER);
    expect(result).toContain(DB_PRIMER);
    expect(result).toContain('Only these commands are allowed: db sqlite query.');
    expect(result).not.toContain('browser goto,');
    expect(result).toContain(NO_BUILTIN_TOOLS_LINE);
    expect(result).not.toContain(NO_TOOLS_LINE);
  });

  it('gives only the no-tools line and Markdown when the caller passes no tools', () => {
    const snapshot = coreSnapshot('ask', ['db sqlite query'], [], true);
    expect(corePrimer(snapshot, [])).toBe([NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
  });
});
