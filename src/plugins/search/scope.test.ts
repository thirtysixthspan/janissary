import { describe, expect, it } from 'vitest';
import type { TabPluginOriginTab } from '../api.js';
import { refusalLine, sameScope, scopeDisplay, scopeFrom, type SearchScope } from './scope.js';

const base = { label: 'tab', cwd: '/c', root: '/r' };
const localWs = { dir: '/w/claude-2', label: 'claude-2', display: '$workspace/claude-2' };
const remoteWs = { ...localWs, dir: '/far/claude-2', display: '~/far/claude-2', ride: 'shell-1', host: 'box' };

const local: SearchScope = { kind: 'local', ...localWs };
const remote: SearchScope = { kind: 'remote', ...remoteWs };

describe('scopeFrom', () => {
  it('gives launch for a launch-shell origin and a null origin', () => {
    expect(scopeFrom({ ...base, view: 'shell' })).toEqual({ kind: 'scope', scope: { kind: 'launch' } });
    expect(scopeFrom(null)).toEqual({ kind: 'scope', scope: { kind: 'launch' } });
  });

  it('gives local for a local harness with its label and display', () => {
    expect(scopeFrom({ ...base, workspace: localWs })).toEqual({ kind: 'scope', scope: local });
  });

  it('gives remote for a remote harness with host and ride', () => {
    expect(scopeFrom({ ...base, remote: true, workspace: remoteWs })).toEqual({ kind: 'scope', scope: remote });
  });

  it('gives remote for an editor of a materialized remote file', () => {
    expect(scopeFrom({ ...base, plugin: 'editor', workspace: remoteWs })).toEqual({ kind: 'scope', scope: remote });
  });

  it('maps a riding record without a host to an empty host', () => {
    const noHost = { ...remoteWs, host: undefined };
    expect(scopeFrom({ ...base, workspace: noHost })).toEqual({ kind: 'scope', scope: { ...remote, host: '' } });
  });

  it('ignores offline', () => {
    expect(scopeFrom({ ...base, workspace: { ...localWs, offline: true } })).toEqual({ kind: 'scope', scope: local });
  });

  it('keeps the scope for the search tab itself', () => {
    expect(scopeFrom({ ...base, plugin: 'search', workspace: localWs })).toEqual({ kind: 'keep' });
  });

  it('refuses a provisioning clone with the workspace label', () => {
    expect(scopeFrom({ ...base, provisioning: true, workspace: localWs }))
      .toEqual({ kind: 'refuse', reason: 'not-ready', label: 'claude-2' });
  });

  it('refuses an unanswered remote tab with workspaceLabel, else its own label', () => {
    expect(scopeFrom({ ...base, remote: true, provisioning: true, workspaceLabel: 'claude-3' }))
      .toEqual({ kind: 'refuse', reason: 'not-ready', label: 'claude-3' });
    expect(scopeFrom({ ...base, remote: true, provisioning: true }))
      .toEqual({ kind: 'refuse', reason: 'not-ready', label: 'tab' });
  });

  it.each(['editor', 'navigator', 'agent-monitor'])('refuses a gone %s record with its label', (plugin) => {
    const origin: TabPluginOriginTab = { ...base, plugin, workspace: { ...localWs, gone: true } };
    expect(scopeFrom(origin)).toEqual({ kind: 'refuse', reason: 'gone', label: 'claude-2' });
  });

  it('refuses a gone riding record rather than giving remote', () => {
    const released = { dir: '', label: 'shell-1', display: '', ride: 'shell-1', host: 'box', gone: true as const };
    expect(scopeFrom({ ...base, remote: true, workspace: released }))
      .toEqual({ kind: 'refuse', reason: 'gone', label: 'shell-1' });
  });
});

describe('refusalLine', () => {
  it('words both notifications exactly', () => {
    expect(refusalLine('not-ready', 'claude-2')).toBe('Search: the workspace of "claude-2" is not ready yet.');
    expect(refusalLine('gone', 'claude-2')).toBe('Search: the workspace of "claude-2" is no longer available.');
  });
});

describe('sameScope', () => {
  it('is true for the same local dir and false across kinds', () => {
    expect(sameScope(local, { ...local, label: 'other', display: 'x' })).toBe(true);
    expect(sameScope(local, remote)).toBe(false);
    expect(sameScope({ kind: 'launch' }, local)).toBe(false);
    expect(sameScope({ kind: 'launch' }, { kind: 'launch' })).toBe(true);
  });

  it('is false for two local dirs and for one dir on two hosts', () => {
    expect(sameScope(local, { ...local, dir: '/w/claude-3' })).toBe(false);
    expect(sameScope(remote, { ...remote, host: 'other' })).toBe(false);
  });

  it('is true for one remote workspace through two riding tabs', () => {
    expect(sameScope(remote, { ...remote, ride: 'shell-2' })).toBe(true);
  });
});

describe('scopeDisplay', () => {
  it('shows $root for launch and the display otherwise', () => {
    expect(scopeDisplay({ kind: 'launch' })).toBe('$root');
    expect(scopeDisplay(local)).toBe('$workspace/claude-2');
    expect(scopeDisplay(remote)).toBe('~/far/claude-2');
  });
});
