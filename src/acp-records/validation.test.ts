import { describe, expect, it } from 'vitest';
import { ACP_RECORD_SCHEMA_VERSION } from './model.js';
import type { AcpRecord, AcpRecordSource } from './types.js';
import { isAcpRecord, isRecordOutcome, isRecordSource } from './validation.js';

const core: AcpRecordSource = { kind: 'acp', model: 'provider/model', ownerLabel: 'caller', ownerName: 'Caller' };
const agent: AcpRecordSource = { ...core, kind: 'agent', runId: 'run', taskPath: 'task.md' };

describe('ACP record source validation', () => {
  it('accepts a defined subagent role and preserves its supplied spelling', () => {
    expect(isRecordSource({ ...agent, subagentRole: 'research' })).toBe(true);
    expect(isRecordSource({ ...agent, subagentRole: 'Research' })).toBe(true);
  });

  it.each(['', ' '.repeat(3), 7, null])('rejects an invalid subagent role %j', (subagentRole) => {
    expect(isRecordSource({ ...agent, subagentRole })).toBe(false);
  });

  it('accepts legacy agent and core sources without a subagent role', () => {
    expect(isRecordSource(agent)).toBe(true);
    expect(isRecordSource(core)).toBe(true);
  });

  it('loads a stored subagent record without migration', () => {
    const id = 'a0b1c2d3-0000-4000-8000-000000000000';
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id,
      source: { ...agent, subagentRole: 'research' }, title: 'Subagent: task.md',
      startedAt: 0, updatedAt: 1, endedAt: 1, outcome: 'Completed',
      blocks: [{ prompt: 'task', startedAt: 0, entries: [], answer: '', endedAt: 1 }],
    };
    expect(isAcpRecord(record, id)).toBe(true);
    expect(isRecordOutcome(record.source, 'Completed')).toBe(true);
  });

  it('accepts Partial only for agent records and preserves every prior outcome', () => {
    expect(isRecordOutcome(agent, 'Partial')).toBe(true);
    expect(isRecordOutcome(core, 'Partial')).toBe(false);
    expect(isRecordOutcome(core, 'Closed')).toBe(true);
    for (const outcome of ['Completed', 'Failed', 'Terminated'] as const) {
      expect(isRecordOutcome(agent, outcome)).toBe(true);
      expect(isRecordOutcome(core, outcome)).toBe(false);
    }
  });

  it('loads a record with paired tool activity without migration', () => {
    const id = 'a0b1c2d3-0000-4000-8000-000000000002';
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id, source: core, title: 'ACP: list',
      startedAt: 0, updatedAt: 2, blocks: [{
        prompt: 'list', startedAt: 0, answer: 'a.md', endedAt: 2, entries: [
          { kind: 'tool', text: 'file list .', timestamp: 1, toolPhase: 'command' },
          { kind: 'tool', text: 'a.md', timestamp: 2, toolPhase: 'reply', toolCommand: 'file list .' },
        ],
      }],
    };
    expect(isAcpRecord(record, id)).toBe(true);
  });

  it('accepts a string preamble and rejects a non-string one', () => {
    const id = 'a0b1c2d3-0000-4000-8000-00000000000a';
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id, source: core, title: 'ACP: list',
      startedAt: 0, updatedAt: 2, blocks: [{ prompt: 'list', startedAt: 0, entries: [], answer: 'done', endedAt: 2 }],
    };
    expect(isAcpRecord({ ...record, blocks: [{ ...record.blocks[0], preamble: 'tool primer' }] }, id)).toBe(true);
    expect(isAcpRecord({ ...record, blocks: [{ ...record.blocks[0], preamble: 3 }] }, id)).toBe(false);
  });

  it.each(['start', 3, null])('rejects an invalid tool phase %j', (toolPhase) => {
    const id = 'a0b1c2d3-0000-4000-8000-000000000003';
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id, source: core, title: 'ACP: list',
      startedAt: 0, updatedAt: 1, blocks: [{
        prompt: 'list', startedAt: 0, answer: 'a.md', endedAt: 1,
        entries: [{ kind: 'tool', text: 'file list .', timestamp: 1, toolPhase: toolPhase as never }],
      }],
    };
    expect(isAcpRecord(record, id)).toBe(false);
  });

  it('loads a stored Partial agent record without migration', () => {
    const id = 'a0b1c2d3-0000-4000-8000-000000000001';
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id,
      source: { ...agent, subagentRole: 'research' }, title: 'Subagent: task.md',
      startedAt: 0, updatedAt: 1, endedAt: 1, outcome: 'Partial',
      blocks: [{ prompt: 'task', startedAt: 0, entries: [], answer: 'partial answer', endedAt: 1 }],
    };
    expect(isAcpRecord(record, id)).toBe(true);
    expect(isRecordOutcome(record.source, 'Partial')).toBe(true);
    expect(isRecordOutcome(core, 'Partial')).toBe(false);
  });
});
