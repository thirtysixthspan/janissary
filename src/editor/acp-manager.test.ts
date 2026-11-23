import { describe, it, expect } from 'vitest';
import type { Managers } from '../managers.js';
import { EditorAcpManager } from './acp-manager.js';

// Editor queries run through the tab's core ACP role session now, so this manager no longer
// opens sessions. Its remaining surface is the shell subplan 6 will remove.
describe('EditorAcpManager', () => {
  it('reports no sessions or connections', () => {
    const manager = new EditorAcpManager({} as Managers);

    expect(manager.hasSession('notes', 'reviewer')).toBe(false);
    expect(manager.connectionsFor('notes')).toEqual([]);
  });

  it('close reports no session, and closeTab/dispose are harmless no-ops', () => {
    const manager = new EditorAcpManager({} as Managers);

    expect(manager.close('notes', 'reviewer')).toBe(false);
    expect(() => manager.closeTab('notes')).not.toThrow();
    expect(() => { manager.dispose(); manager.dispose(); }).not.toThrow();
    expect(manager.connectionsFor('notes')).toEqual([]);
  });

  it('transcript is empty when nothing has been recorded', () => {
    const manager = new EditorAcpManager({} as Managers);

    expect(manager.transcript('notes', 'reviewer')).toBe('');
  });
});
