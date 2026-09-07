import { describe, expect, it } from 'vitest';
import { CORE_PARAMS } from './core.js';

// One row per method: the params the client actually sends, and the mistyped variants that used to
// reach the dispatcher and be read at their declared type anyway.
const CASES: Array<[keyof typeof CORE_PARAMS, Record<string, unknown>, Array<Record<string, unknown>>]> = [
  ['command', { text: 'help' }, [{}, { text: 7 }, { text: null }]],
  ['setActiveTab', { index: 0 }, [{}, { index: '0' }, { index: 1.5 }]],
  ['focusTab', { label: 'one' }, [{}, { label: 3 }]],
  ['closeTab', { index: 2 }, [{ index: '2' }]],
  ['renameTab', { index: 0, title: 'one' }, [{ index: 0 }, { index: 0, title: 1 }, { title: 'one' }]],
  ['editQueuedCommand', { index: 0, text: 'ls' }, [{ index: 0 }, { index: 0, text: [] }]],
  ['deleteQueuedCommand', { index: 1 }, [{ index: true }]],
  ['moveTab', { dir: -1 }, [{ dir: 0 }, { dir: '1' }, {}]],
  ['moveTabToOtherPane', { index: 0 }, [{ index: null }]],
  ['reorderTab', { dir: 1 }, [{ dir: 2 }]],
  ['reorderTabTo', { from: 0, to: 3 }, [{ from: 0 }, { from: '0', to: 3 }]],
  ['chooseRoute', { index: 0 }, [{ index: 'first' }]],
  ['answerQuestion', { tab: 'one', id: 'q1', answer: 'yes' }, [{ tab: 'one', id: 'q1' }, { tab: 'one', id: 'q1', answer: 7 }]],
  ['complete', { text: 'shell RE', cursor: 8 }, [{ text: 'shell RE' }, { text: 'shell RE', cursor: '8' }]],
  ['resize', { cols: 80, rows: 24 }, [{ cols: 80 }, { cols: '80', rows: 24 }]],
  ['ptyInput', { id: 'p1', data: 'ls\n' }, [{ id: 'p1' }, { id: 1, data: '' }]],
  ['ptyResize', { id: 'p1', cols: 80, rows: 24 }, [{ id: 'p1', cols: 80 }, { id: 'p1', cols: 80, rows: null }]],
  ['ptyKill', { id: 'p1' }, [{}, { id: 1 }]],
  ['reportLayout', { sidebarLeft: 240, sidebarRight: 300, tabAreaPct: 62.5 }, [
    { sidebarLeft: '240', sidebarRight: 300, tabAreaPct: 62.5 },
    { sidebarLeft: 240, sidebarRight: 300 },
    { sidebarLeft: NaN, sidebarRight: 300, tabAreaPct: 62.5 },
  ]],
  ['setDock', { index: 0, dock: null }, [{ index: 0 }, { index: 0, dock: 'centre' }]],
  ['launchAgentFor', { label: 'one' }, [{ label: [] }]],
  ['openTranscriptFor', { label: 'one' }, [{}]],
  ['openHarnessTranscriptFor', { label: 'one' }, [{ label: 0 }]],
  ['openAcpTranscript', { acpRef: { scope: 'tab', label: 'one' } }, [
    {},
    { acpRef: { scope: 'tab' } },
    { acpRef: { scope: 'window', label: 'one' } },
    { acpRef: { scope: 'editor', label: 'one' } },
    { acpRef: 'one' },
  ]],
];

describe('core RPC params decoders', () => {
  it.each(CASES)('accepts the %s params the client sends', (method, valid) => {
    expect(CORE_PARAMS[method](valid)).toBe(true);
  });

  it.each(CASES)('rejects malformed %s params', (method, _valid, invalid) => {
    for (const params of invalid) expect(CORE_PARAMS[method](params)).toBe(false);
  });

  it('accepts the editor scope of an ACP ref when both of its fields are present', () => {
    expect(CORE_PARAMS.openAcpTranscript({ acpRef: { scope: 'editor', label: 'one', persona: 'critic' } })).toBe(true);
    expect(CORE_PARAMS.openAcpTranscript({ acpRef: { scope: 'monitor', name: 'watch' } })).toBe(true);
  });
});
