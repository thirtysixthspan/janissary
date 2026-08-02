import { describe, it, expect } from 'vitest';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { harnessTranscriptFeedEntries } from './harness-transcript-feed.js';

function harnessTab(label: string, group = 1): Tab {
  return { label, view: 'harness', group } as unknown as Tab;
}

// Only a spawned harness has a tailer; a tab absent from `transcripts` stands for one that has none
// (an ssh tab, or a plain tab).
function makeManagers(tabs: Tab[], transcripts: Record<string, string[] | undefined>): Managers {
  return {
    tab: { tabs },
    harness: {
      transcriptTailer: (label: string) => {
        const entries = transcripts[label];
        return entries && { entriesAfter: (index: number) => entries.slice(index) };
      },
    },
  } as unknown as Managers;
}

const claudeTarget = [{ kind: 'tab' as const, label: 'claude' }];

describe('harnessTranscriptFeedEntries', () => {
  it('feeds a harness target its accumulated transcript entries as one block', () => {
    const managers = makeManagers([harnessTab('claude')], { claude: ['user: hello', 'assistant: hi'] });
    const entries = harnessTranscriptFeedEntries(managers, claudeTarget, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0].tabLabel).toBe('claude');
    expect(entries[0].entry.output).toBe('user: hello\n\nassistant: hi');
  });

  it('feeds nothing on a second flush with nothing new, then only the new entries', () => {
    const transcripts: Record<string, string[]> = { claude: ['user: hello'] };
    const managers = makeManagers([harnessTab('claude')], transcripts);
    const seen = new Map<string, number>();
    expect(harnessTranscriptFeedEntries(managers, claudeTarget, seen)).toHaveLength(1);
    expect(harnessTranscriptFeedEntries(managers, claudeTarget, seen)).toEqual([]);
    transcripts.claude.push('assistant: hi');
    const entries = harnessTranscriptFeedEntries(managers, claudeTarget, seen);
    expect(entries[0].entry.output).toBe('assistant: hi');
  });

  it('advances each monitor\'s cursor independently, so two monitors both see the whole stream', () => {
    const managers = makeManagers([harnessTab('claude')], { claude: ['user: hello'] });
    const first = new Map<string, number>();
    const second = new Map<string, number>();
    expect(harnessTranscriptFeedEntries(managers, claudeTarget, first)[0].entry.output).toBe('user: hello');
    expect(harnessTranscriptFeedEntries(managers, claudeTarget, second)[0].entry.output).toBe('user: hello');
  });

  it('ignores an ssh target, which has the harness-view shape but no tailer', () => {
    const managers = makeManagers([harnessTab('ssh')], {});
    expect(harnessTranscriptFeedEntries(managers, [{ kind: 'tab', label: 'ssh' }], new Map())).toEqual([]);
  });

  it('ignores a non-harness target', () => {
    const managers = makeManagers([{ label: 'janus', group: 1 } as unknown as Tab], {});
    expect(harnessTranscriptFeedEntries(managers, [{ kind: 'tab', label: 'janus' }], new Map())).toEqual([]);
  });

  it('caps an oversized batch with the truncation note', () => {
    const managers = makeManagers([harnessTab('claude')], { claude: ['x'.repeat(30_000)] });
    const entries = harnessTranscriptFeedEntries(managers, claudeTarget, new Map());
    expect(entries[0].entry.output).toContain('truncated (30000 bytes total)');
    expect(entries[0].entry.output.length).toBeLessThan(30_000);
  });

  it('resolves a group target to its harness member tabs', () => {
    const tabs = [harnessTab('claude', 2), harnessTab('codex', 2), harnessTab('other', 3)];
    const managers = makeManagers(tabs, { claude: ['a'], codex: ['b'], other: ['c'] });
    const entries = harnessTranscriptFeedEntries(managers, [{ kind: 'group', group: 2 }], new Map());
    expect(entries.map((e) => e.tabLabel)).toEqual(['claude', 'codex']);
  });
});
