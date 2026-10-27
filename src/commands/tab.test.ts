import { describe, expect, it, vi } from 'vitest';
import { command } from './tab.js';
import { commands } from './index.js';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab/index.js';
import { notify } from '../notifications/index.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

function fixture() {
  const tabs = [
    makeTab('janus', '#fff'),
    { ...makeTab('system', '#fff'), title: 'Review Notes', hidden: true as const },
    makeTab('review notes', '#fff'),
  ];
  const append = vi.fn();
  const appendForInvocation = vi.fn();
  const setActiveTab = vi.fn();
  const arrangeTab = vi.fn(() => true);
  const managers = {
    tab: {
      tabs, append, appendForInvocation, setActiveTab, arrangeTab,
      findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
    },
  } as unknown as Managers;
  return { managers, append, appendForInvocation, setActiveTab, arrangeTab };
}

describe('tab command', () => {
  it.each([
    ['tab', String.raw`Usage: tab focus|move|pane|split|color|group|dock|undock \<tab\> [argument].`],
    ['TAB focus', String.raw`Usage: tab focus \<name\>.`],
    ['tab close notes', String.raw`Usage: tab focus|move|pane|split|color|group|dock|undock \<tab\> [argument].`],
    ['tab focus   ', String.raw`Usage: tab focus \<name\>.`],
  ])('claims malformed %s and prints exact usage on the invocation', async (input, usage) => {
    const { managers, appendForInvocation, append, setActiveTab, arrangeTab } = fixture();
    expect(commands.find((entry) => entry.match(input))).toBe(command);
    await command.run(input, { label: 'janus', index: 0 }, managers, { invocationId: 'one' } as never);
    expect(appendForInvocation).toHaveBeenCalledWith('janus', { input, output: usage }, 'one');
    expect(append).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(arrangeTab).not.toHaveBeenCalled();
  });

  it.each(['tab focus SYSTEM', 'TaB FoCuS   "review notes"   '])('resolves focus %s by label or alias silently', async (input) => {
    const { managers, append, setActiveTab } = fixture();
    await command.run(input, { label: 'janus', index: 0 }, managers);
    expect(setActiveTab).toHaveBeenCalledWith(1);
    expect(append).not.toHaveBeenCalled();
  });

  it('requires spaced focus names to be quoted and reports misses without arranging', async () => {
    const { managers, append, setActiveTab, arrangeTab } = fixture();
    await command.run('tab focus review notes', { label: 'janus', index: 0 }, managers);
    expect(append).toHaveBeenCalledWith('janus', {
      input: 'tab focus review notes', output: String.raw`Usage: tab focus \<name\>.`,
    });
    append.mockClear();
    await command.run('tab focus "Missing Notes"', { label: 'janus', index: 0 }, managers);
    expect(append).toHaveBeenCalledWith('janus', {
      input: 'tab focus "Missing Notes"', output: 'No tab named "Missing Notes".',
    });
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(arrangeTab).not.toHaveBeenCalled();
    expect(command.match('table focus notes')).toBe(false);
  });

  it.each([
    'tab move "missing tab" 1',
    'tab pane "missing tab" left',
    'tab split "missing tab"',
    'tab color "missing tab" #123456',
    'tab group "missing tab" review',
    'tab dock "missing tab" left',
    'tab undock "missing tab"',
  ])('reports a missing target for %s without arranging it', async (input) => {
    const { managers, append, arrangeTab } = fixture();
    await command.run(input, { label: 'janus', index: 0 }, managers);
    expect(append).toHaveBeenCalledWith('janus', { input, output: 'No tab named "missing tab".' });
    expect(arrangeTab).not.toHaveBeenCalled();
  });

  it.each([
    ['move', '2', { kind: 'move', position: 2 }],
    ['pane', 'right', { kind: 'pane', side: 'right' }],
    ['split', '', { kind: 'split' }],
    ['color', '#FF8800', { kind: 'color', color: '#FF8800' }],
    ['group', 'Review', { kind: 'group', selector: 'Review' }],
    ['dock', 'left', { kind: 'dock', side: 'left' }],
    ['undock', '', { kind: 'undock' }],
  ] as const)('arranges %s by label and alias silently', async (subcommand, argument, change) => {
    const { managers, arrangeTab, append } = fixture();
    for (const target of ['janus', '"Review Notes"']) {
      const suffix = argument ? ` ${argument}` : '';
      await command.run(`tab ${subcommand} ${target}${suffix}`, { label: 'janus', index: 0 }, managers);
      const expectedTarget = target === 'janus' ? 'janus' : 'system';
      expect(arrangeTab).toHaveBeenLastCalledWith(expectedTarget, change);
    }
    expect(append).not.toHaveBeenCalled();
  });

  it.each([
    ['group', 'Review Notes', '1', 'Cannot group "Review Notes".'],
    ['pane', 'Review Notes', 'right', 'Cannot move "Review Notes" to a pane.'],
    ['split', 'Review Notes', '', 'Cannot move "Review Notes" to a pane.'],
    ['dock', 'Review Notes', 'left', 'Cannot dock "Review Notes".'],
    ['undock', 'Review Notes', '', 'Cannot undock "Review Notes".'],
  ])('sends a %s refusal to notifications without transcript output', async (subcommand, target, argument, message) => {
    const { managers, arrangeTab, append, appendForInvocation } = fixture();
    arrangeTab.mockReturnValue(false);
    const suffix = argument ? ` ${argument}` : '';
    await command.run(`tab ${subcommand} "${target}"${suffix}`, { label: 'janus', index: 0 }, managers);
    expect(notify).toHaveBeenCalledWith(managers, 'tab', 'janus', message);
    expect(append).not.toHaveBeenCalled();
    expect(appendForInvocation).not.toHaveBeenCalled();
  });
});
