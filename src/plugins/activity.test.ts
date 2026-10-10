import { describe, expect, it } from 'vitest';
import { tabActivityRows, recordGateNeedsUser } from './activity.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// The managers the activity reader needs, stubbed to exactly what it asks for: the tab list, the launch
// directory, the pending questions, and one label lookup. Anything more would be a stub pretending to be
// a host it is not.
type ManagersStub = Pick<Managers, 'tab' | 'questions' | 'harness'>;

function tab(overrides: Partial<Tab> = {}): Tab {
  return {
    label: 'shell',
    dotColor: '#5b9cff',
    number: 1,
    group: 1,
    groupColor: '#5b9cff',
    log: [],
    cmdHistory: [],
    cmdHistoryIdx: -1,
    scrollOffset: 0,
    runtime: { busy: false, context: [], queue: [] },
    ...overrides,
  } as Tab;
}

type PendingFor = Managers['questions']['pendingFor'];

function noPendingQuestion(): undefined {}

function managers(
  tabs: Tab[],
  pendingFor: PendingFor = noPendingQuestion,
  harnessTranscripts: Record<string, string[]> = {},
): { managers: ManagersStub } {
  return {
    managers: {
      tab: {
        tabs,
        launchDir: '/repo',
        byLabel: (label: string) => tabs.find((candidate) => candidate.label === label),
      } as unknown as ManagersStub['tab'],
      questions: { pendingFor } as unknown as ManagersStub['questions'],
      harness: {
        transcriptTailer: (label: string) => {
          const entries = harnessTranscripts[label];
          if (!entries) return;
          return { entriesAfter: (index: number) => entries.slice(index) } as unknown as ReturnType<Managers['harness']['transcriptTailer']>;
        },
      } as unknown as ManagersStub['harness'],
    },
  };
}

describe('the tabActivity reader', () => {
  it('reports every tab in strip order, with its dock, pane, and view facts', () => {
    const { managers: host } = managers([
      tab({ label: 'one', view: 'plugin', dock: 'left' }),
      tab({ label: 'two', view: 'harness', pane: 'right' }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows.map((row) => row.label)).toEqual(['one', 'two']);
    expect(rows[0]?.dock).toBe('left');
    expect(rows[0]?.view).toBe('plugin');
    expect(rows[1]?.pane).toBe('right');
    expect(rows[1]?.view).toBe('harness');
  });

  it('keeps an incarnation identity stable for an open tab and changes it when its label is reused', () => {
    const original = tab({ label: 'reused' });
    const firstHost = managers([original]).managers;
    const firstIdentity = tabActivityRows(firstHost as unknown as Managers)[0]?.incarnation;
    const repeatedIdentity = tabActivityRows(firstHost as unknown as Managers)[0]?.incarnation;
    const shallowCopyIdentity = tabActivityRows(managers([{ ...original, number: 2 }]).managers as unknown as Managers)[0]?.incarnation;
    const replacement = tab({ label: 'reused' });
    const replacementIdentity = tabActivityRows(managers([replacement]).managers as unknown as Managers)[0]?.incarnation;

    expect(firstIdentity).toBeDefined();
    expect(repeatedIdentity).toBe(firstIdentity);
    expect(shallowCopyIdentity).toBe(firstIdentity);
    expect(replacementIdentity).not.toBe(firstIdentity);
  });

  it('reports busy from either the runtime flag or a plugin-lit dot', () => {
    const { managers: host } = managers([
      tab({ label: 'running', runtime: { busy: true, context: [], queue: [] } }),
      tab({
        label: 'plugin-lit', plugin: { id: 'audio', instanceKey: 'audio', schemaVersion: 1, payload: {}, busy: true },
      }),
      tab({ label: 'idle' }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows.map((row) => row.busy)).toEqual([true, true, false]);
  });

  it('reports needs input for a pending question, and for a gate the capture handler recorded', () => {
    const { managers: host } = managers(
      [
        tab({ label: 'asking', runtime: { busy: false, context: [], queue: [], gateNeedsUser: true } }),
        tab({ label: 'questioning', runtime: { busy: false, context: [], queue: [] } }),
        tab({ label: 'working' }),
      ],
      (label: string) => (label === 'questioning' ? { id: 'q1', tab: label, kind: 'ask', question: 'Yes?' } : undefined),
    );

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows.map((row) => row.needsInput)).toEqual([true, true, false]);
  });

  it('does not mark an ordinary tab as needing input when no question is pending', () => {
    const { managers: host } = managers([tab()]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.needsInput).toBe(false);
  });

  it('reports last activity minute-rounded, and zero for a tab with nothing yet', () => {
    const at = new Date('2026-01-01T12:34:56.789Z').getTime();
    const { managers: host } = managers([
      tab({ label: 'active', runtime: { busy: false, context: [], queue: [], lastActivity: at } }),
      tab({ label: 'fresh' }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.lastActivity).toBe(new Date('2026-01-01T12:34:00.000Z').getTime());
    expect(rows[1]?.lastActivity).toBe(0);
  });

  it('carries the transcript tail only when the caller asked for it', () => {
    const { managers: host } = managers([
      tab({
        label: 'shell',
        log: [
          { input: 'ls', output: 'a b c' },
          { input: '', output: 'idle again' },
        ],
      }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers, 8);

    expect(rows[0]?.logLength).toBe(2);
    expect(rows[0]?.tail).toBe('ls\na b c\n\nidle again');
    expect(rows[0]?.lastCommand).toBe('ls');
  });

  it.each([0, -1, NaN, Infinity, 0.5])(
    'omits transcript content for an unusable tail limit (%s)',
    (limit) => {
      const log = Array.from({ length: 10 }, (_, index) => ({ input: '', output: `entry-${index}` }));
      const { managers: host } = managers([tab({ log })]);

      const rows = tabActivityRows(host as unknown as Managers, limit);

      expect(rows[0]?.tail).toBeUndefined();
    },
  );

  it.each([1, 8])('returns the newest %s transcript entries', (limit) => {
    const log = Array.from({ length: 10 }, (_, index) => ({ input: '', output: `entry-${index}` }));
    const { managers: host } = managers([tab({ log })]);

    const rows = tabActivityRows(host as unknown as Managers, limit);
    const expected = Array.from({ length: limit }, (_, index) => `entry-${10 - limit + index}`).join('\n\n');

    expect(rows[0]?.tail).toBe(expected);
  });

  it('reports the transcript revision the host wrote, and zero for a tab with none yet', () => {
    const { managers: host } = managers([
      tab({ label: 'written', runtime: { busy: false, context: [], queue: [], transcriptRevision: 5 } }),
      tab({ label: 'fresh' }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.revision).toBe(5);
    expect(rows[1]?.revision).toBe(0);
  });

  it('carries no transcript content at all when the caller did not ask for it', () => {
    const { managers: host } = managers([tab({ label: 'shell', log: [{ input: 'ls', output: 'a b c' }] })]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.tail).toBeUndefined();
    expect(rows[0]?.logLength).toBe(1);
  });

  it('includes normalized harness transcript entries only in a requested tail', () => {
    const harness = tab({ label: 'claude', view: 'harness' });
    const { managers: host } = managers([harness], noPendingQuestion, {
      claude: ['user: inspect the build', 'assistant: found a missing export'],
    });

    const displayRows = tabActivityRows(host as unknown as Managers);
    const summaryRows = tabActivityRows(host as unknown as Managers, 1);

    expect(displayRows[0]?.tail).toBeUndefined();
    expect(summaryRows[0]?.tail).toBe('assistant: found a missing export');
    expect(summaryRows[0]?.logLength).toBe(2);
  });

  it('caps harness transcript tails by characters', () => {
    const { managers: host } = managers([tab({ label: 'claude', view: 'harness' })], noPendingQuestion, {
      claude: ['a'.repeat(3000), 'b'.repeat(3000)],
    });

    const rows = tabActivityRows(host as unknown as Managers, 2);

    expect(rows[0]?.tail).toBe(`${'a'.repeat(998)}\n\n${'b'.repeat(3000)}`);
  });

  it('keeps editor contents out of display reads and fingerprints requested content', () => {
    const editor = tab({
      label: 'notes',
      view: 'editor',
      editor: { name: 'notes.md', path: '/repo/notes.md', size: '3 B', url: '/open/notes' },
      editorDraft: { content: 'one', updatedAt: 1 },
    });
    const { managers: host } = managers([editor]);

    const displayRow = tabActivityRows(host as unknown as Managers)[0];
    const firstSummaryRow = tabActivityRows(host as unknown as Managers, 8)[0];
    editor.editorDraft = { content: 'two', updatedAt: 2 };
    const changedSummaryRow = tabActivityRows(host as unknown as Managers, 8)[0];

    expect(displayRow?.tail).toBeUndefined();
    expect(firstSummaryRow?.tail).toBe('one');
    expect(changedSummaryRow?.tail).toBe('two');
    expect(changedSummaryRow?.logLength).toBe(firstSummaryRow?.logLength);
    expect(changedSummaryRow?.contentFingerprint).not.toBe(firstSummaryRow?.contentFingerprint);
  });

  it('caps one tail by both entry count and characters', () => {
    const { managers: host } = managers([tab({
      label: 'shell',
      log: [
        { input: 'first', output: 'a'.repeat(3000) },
        { input: 'second', output: 'b'.repeat(3000) },
      ],
    })]);

    const rows = tabActivityRows(host as unknown as Managers, 1);

    expect(rows[0]?.tail).toBe('second\n' + 'b'.repeat(3000));
  });

  it('reports the remote host a tab runs on, and the last command it ran', () => {
    const { managers: host } = managers([
      tab({ label: 'far', remote: { address: 'a@b:1', host: 'b' } as Tab['remote'], log: [{ input: 'uptime', output: 'ok' }] }),
    ]);

    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.remote).toBe('b');
    expect(rows[0]?.lastCommand).toBe('uptime');
  });
});

describe('recording a permission gate the user has to answer', () => {
  const stubFor = (tabs: Tab[], label: string): Managers =>
    ({ tab: { byLabel: (name: string) => (name === label ? tabs[0] : undefined) } }) as unknown as Managers;

  it('writes it onto the tab the host hands it', () => {
    const blocked = tab({ label: 'shell', runtime: { busy: false, context: [], queue: [] } });

    recordGateNeedsUser(stubFor([blocked], 'shell'), 'shell', true);

    expect(blocked.runtime?.gateNeedsUser).toBe(true);
  });

  it('does nothing for a label with no open tab', () => {
    const blocked = tab({ label: 'shell', runtime: { busy: false, context: [], queue: [] } });

    recordGateNeedsUser(stubFor([blocked], 'other'), 'shell', true);

    expect(blocked.runtime?.gateNeedsUser).toBeUndefined();
  });

  // The fact is a decision, not a detection: a gate the application is answering is recorded as
  // nothing to answer, and the launcher's needs-you tier is not raised for a prompt nobody has to read.
  it('leaves a gate the approver is clearing out of the needs-you tier', () => {
    const blocked = tab({ label: 'shell', runtime: { busy: false, context: [], queue: [] } });
    const host = { tab: { tabs: [blocked], launchDir: '/repo', byLabel: () => blocked }, questions: { pendingFor: (): unknown => undefined } };

    recordGateNeedsUser(stubFor([blocked], 'shell'), 'shell', false);
    const rows = tabActivityRows(host as unknown as Managers);

    expect(rows[0]?.needsInput).toBe(false);
    expect(blocked.runtime?.gateNeedsUser).not.toBe(true);
  });
});
