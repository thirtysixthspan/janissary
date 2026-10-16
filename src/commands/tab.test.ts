import { describe, expect, it, vi } from 'vitest';
import { command } from './tab.js';
import { commands } from './index.js';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab/index.js';

function fixture() {
  const tabs = [makeTab('janus', '#fff'), { ...makeTab('system', '#fff'), title: 'Review Notes', hidden: true as const }, makeTab('review notes', '#fff')];
  const append = vi.fn();
  const appendForInvocation = vi.fn();
  const setActiveTab = vi.fn();
  const managers = { tab: { tabs, append, appendForInvocation, setActiveTab, findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label) } } as unknown as Managers;
  return { managers, append, appendForInvocation, setActiveTab };
}

describe('tab focus', () => {
  it.each(['tab', 'TAB focus', 'tab close notes', 'tab focus   '])('claims malformed %s and prints exact usage on the invocation', async (input) => {
    const { managers, appendForInvocation, append, setActiveTab } = fixture();
    expect(commands.find((entry) => entry.match(input))).toBe(command);
    await command.run(input, { label: 'janus', index: 0 }, managers, { invocationId: 'one' } as never);
    expect(appendForInvocation).toHaveBeenCalledWith('janus', { input, output: 'Usage: tab focus <name>.' }, 'one');
    expect(append).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it.each(['tab focus SYSTEM', 'TaB FoCuS   review notes   '])('resolves %s by the first full-array label or alias match silently', async (input) => {
    const { managers, append, setActiveTab } = fixture();
    await command.run(input, { label: 'janus', index: 0 }, managers);
    expect(setActiveTab).toHaveBeenCalledWith(1);
    expect(append).not.toHaveBeenCalled();
  });

  it('reports a missing target verbatim and does not claim tab-prefixed words', async () => {
    const { managers, append, setActiveTab } = fixture();
    await command.run('tab focus Missing Notes', { label: 'janus', index: 0 }, managers);
    expect(append).toHaveBeenCalledWith('janus', { input: 'tab focus Missing Notes', output: 'No tab named "Missing Notes".' });
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(command.match('table focus notes')).toBe(false);
  });
});
