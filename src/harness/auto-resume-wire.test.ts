import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import type { ScheduleEntry } from '../schedule/types.js';
import { buildAutoResumer } from './auto-resume-wire.js';
import { notify } from '../notifications/index.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('./capture/file.js', () => ({ writeCaptureFile: vi.fn(() => '/project/.janissary/captures/bot-now.txt') }));

const BANNER = '■ You’ve hit your usage limit. Upgrade to Pro, or try again at 1:20 PM.';

function setup(): { tab: Tab; entries: ScheduleEntry[]; cancel: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn>; managers: Managers } {
  const tab = { label: 'bot', harness: { name: 'codex', program: 'codex', ptyId: 'pty1', status: 'running' } } as unknown as Tab;
  const entries: ScheduleEntry[] = [];
  const cancel = vi.fn();
  const add = vi.fn((_label: string, entry: ScheduleEntry) => { entries.push(entry); return entry; });
  const managers = {
    schedule: { add, cancel },
    tab: { harnessTab: (label: string) => (label === 'bot' ? tab : undefined) },
  } as unknown as Managers;
  return { tab, entries, cancel, add, managers };
}

beforeEach(() => vi.mocked(notify).mockClear());

describe('buildAutoResumer', () => {
  it('appends the resume to the tab\'s own schedule and reports it with a capture link', () => {
    const { managers, add, tab } = setup();
    buildAutoResumer(managers, 'codex', 'bot').onCapture({ text: BANNER, capturedAt: 0 });

    expect(add).toHaveBeenCalledTimes(1);
    const [label, entry] = add.mock.calls[0] as unknown as [string, ScheduleEntry];
    expect(label).toBe('bot');
    expect(entry.id).toBe('auto-resume');
    expect(entry.command).toBe('resume the task you were working on.');
    expect(entry.recurring).toBe(false);
    expect(entry.spec).toMatch(/^at \d{1,2}:\d{2}(am|pm)$/);
    expect(entry.nextRun).toBeGreaterThan(Date.now());
    expect(notify).toHaveBeenCalledWith(
      managers, 'auto-resume', 'bot', expect.stringMatching(/^Hit a usage limit; resuming at /),
      { openFile: '/project/.janissary/captures/bot-now.txt' },
    );
    expect(tab.harness?.autoResumeState).toBe('scheduled');
  });

  it('reports delivery when the scheduler says the entry landed, moving the flag on', () => {
    const { managers, add, tab } = setup();
    const resumer = buildAutoResumer(managers, 'codex', 'bot');
    resumer.onCapture({ text: BANNER, capturedAt: 0 });

    (add.mock.calls[0][2] as () => void)();
    expect(tab.harness?.autoResumeState).toBe('resumed');
  });

  it('cancels the pending entry when the blockage clears', () => {
    const { managers, cancel } = setup();
    const resumer = buildAutoResumer(managers, 'codex', 'bot');
    resumer.onCapture({ text: BANNER, capturedAt: 0 });
    resumer.onCapture({ text: 'All done — anything else?' });
    expect(cancel).toHaveBeenCalledWith('bot', 'auto-resume');
  });

  it('schedules nothing for a screen with no limit on it', () => {
    const { managers, add } = setup();
    const resumer = buildAutoResumer(managers, 'codex', 'bot');
    resumer.onCapture({ text: 'All done — anything else?' });
    expect(add).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});