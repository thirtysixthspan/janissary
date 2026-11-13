import { describe, expect, it } from 'vitest';
import { decodeAcpRunSnapshot } from './decode-acp-run.js';

const row = { name: 'file read', effectiveEnabled: false, effectiveAgentAccess: false };
const core = { kind: 'core', role: 'ask', roleName: 'reader', grants: ['file read'], rows: [row], withoutTools: false };
const agent = { kind: 'agent', grants: ['file'], askUser: false };

describe('decodeAcpRunSnapshot', () => {
  it.each([
    ['core with false flags', core],
    ['tell role', { ...core, role: 'tell', withoutTools: true }],
    ['agent with askUser false', agent],
    ['agent with askUser true', { ...agent, askUser: true }],
    ['empty core grants and rows', { ...core, grants: [], rows: [] }],
    ['empty agent grants', { ...agent, grants: [] }],
    ['arbitrary row name', { ...core, rows: [{ ...row, name: '' }] }],
  ])('accepts %s', (_label, snapshot) => {
    expect(decodeAcpRunSnapshot(snapshot)).toEqual(snapshot);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['scalar', 'core'],
    ['unknown kind', { ...core, kind: 'other' }],
    ['invalid role', { ...core, role: 'other' }],
    ['empty role name', { ...core, roleName: '' }],
    ['non-string role name', { ...core, roleName: 1 }],
    ['non-array core grants', { ...core, grants: 'file' }],
    ['numeric core grant', { ...core, grants: [1] }],
    ['non-array agent grants', { ...agent, grants: 'file' }],
    ['numeric agent grant', { ...agent, grants: [1] }],
    ['non-array rows', { ...core, rows: {} }],
    ['null row', { ...core, rows: [null] }],
    ['array row', { ...core, rows: [[]] }],
    ['scalar row', { ...core, rows: ['file read'] }],
    ['numeric row name', { ...core, rows: [{ ...row, name: 1 }] }],
    ['non-boolean enabled', { ...core, rows: [{ ...row, effectiveEnabled: 0 }] }],
    ['missing agent access', { ...core, rows: [{ name: 'file read', effectiveEnabled: true }] }],
    ['non-boolean agent access', { ...core, rows: [{ ...row, effectiveAgentAccess: 'true' }] }],
    ['non-boolean withoutTools', { ...core, withoutTools: 0 }],
    ['missing askUser', { kind: 'agent', grants: [] }],
    ['non-boolean askUser', { ...agent, askUser: 0 }],
  ])('rejects %s', (_label, snapshot) => {
    expect(decodeAcpRunSnapshot(snapshot)).toBeUndefined();
  });

  it('rebuilds core snapshots and rows with declared fields only', () => {
    const input = { ...core, extra: 'drop', rows: [{ ...row, extra: 'drop' }] };
    const decoded = decodeAcpRunSnapshot(input);
    expect(decoded).toEqual(core);
    expect(decoded).not.toBe(input);
    expect(decoded?.grants).not.toBe(input.grants);
    if (decoded?.kind !== 'core') throw new Error('Expected a core snapshot');
    expect(decoded.rows).not.toBe(input.rows);
    expect(decoded.rows[0]).not.toBe(input.rows[0]);
  });

  it('rebuilds agent snapshots with declared fields only', () => {
    const input = { ...agent, extra: 'drop' };
    const decoded = decodeAcpRunSnapshot(input);
    expect(decoded).toEqual(agent);
    expect(decoded).not.toBe(input);
    expect(decoded?.grants).not.toBe(input.grants);
  });
});
