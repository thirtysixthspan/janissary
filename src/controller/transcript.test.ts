import { describe, it, expect, vi } from 'vitest';
import { openTranscriptFileFor, openAcpTranscript } from './transcript.js';
import { writeCaptureFile } from '../harness/capture/file.js';
import type { Managers } from '../managers.js';

vi.mock('../harness/capture/file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/agent-now.txt'),
}));

function makeAcpManagers(overrides: {
  tabs?: { label: string; log: { input: string; output: string }[] }[];
  transcript?: ReturnType<typeof vi.fn>;
  editorTranscript?: ReturnType<typeof vi.fn>;
  edit?: ReturnType<typeof vi.fn>;
  curLabel?: string;
} = {}) {
  const edit = overrides.edit ?? vi.fn();
  const tabs = overrides.tabs ?? [];
  return {
    tab: { tabs, byLabel: (l: string) => tabs.find((t) => t.label === l), cur: () => ({ label: overrides.curLabel ?? 'active' }) },
    monitor: { transcript: overrides.transcript ?? vi.fn(() => '') },
    editorAcp: { transcript: overrides.editorTranscript ?? vi.fn(() => '') },
    openFile: { edit },
  } as unknown as Managers;
}

function makeHarnessManagers(
  tailer: { transcriptFile: () => string | undefined } | undefined,
  edit = vi.fn(),
  tabs: { label: string; transcript?: string }[] = [],
) {
  return {
    harness: { transcriptTailer: vi.fn(() => tailer) },
    tab: { byLabel: (l: string) => tabs.find((t) => t.label === l) },
    openFile: { edit },
  } as unknown as Managers;
}

describe('openTranscriptFileFor', () => {
  it('opens the tailer\'s transcript file in an editor tab', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers({ transcriptFile: () => '/project/.janissary/harness-transcripts/claude-now.txt' }, edit);

    openTranscriptFileFor(managers, 'claude');

    expect(edit).toHaveBeenCalledWith('transcript claude', '/project/.janissary/harness-transcripts/claude-now.txt', 'claude');
  });

  it('is a no-op when the tab has no transcript tailer', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers(undefined, edit);

    openTranscriptFileFor(managers, 'claude');

    expect(edit).not.toHaveBeenCalled();
  });

  it('is a no-op when the tailer has no transcript file yet', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers({ transcriptFile: (): string | undefined => { return; } }, edit);

    openTranscriptFileFor(managers, 'claude');

    expect(edit).not.toHaveBeenCalled();
  });

  it('opens a shell tab\'s transcript from its tab record when it has no tailer', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers(undefined, edit, [
      { label: 'shell', transcript: '/project/.janissary/shell-transcripts/shell-now.txt' },
    ]);

    openTranscriptFileFor(managers, 'shell');

    expect(edit).toHaveBeenCalledWith('transcript shell', '/project/.janissary/shell-transcripts/shell-now.txt', 'shell');
  });

  it('prefers the tailer\'s file over the tab record\'s transcript', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers(
      { transcriptFile: () => '/project/.janissary/harness-transcripts/claude-now.txt' },
      edit,
      [{ label: 'claude', transcript: '/project/.janissary/shell-transcripts/claude-other.txt' }],
    );

    openTranscriptFileFor(managers, 'claude');

    expect(edit).toHaveBeenCalledWith('transcript claude', '/project/.janissary/harness-transcripts/claude-now.txt', 'claude');
  });

  it('is a no-op for a shell tab whose transcript has not opened yet', () => {
    const edit = vi.fn();
    const managers = makeHarnessManagers(undefined, edit, [{ label: 'shell' }]);

    openTranscriptFileFor(managers, 'shell');

    expect(edit).not.toHaveBeenCalled();
  });
});

describe('openAcpTranscript', () => {
  it('routes a tab-scoped ref to the tab\'s transcript', () => {
    const edit = vi.fn();
    const managers = makeAcpManagers({ tabs: [{ label: 'agent', log: [{ input: 'npm test', output: '1 failing' }] }], edit });

    openAcpTranscript(managers, { scope: 'tab', label: 'agent' });

    expect(writeCaptureFile).toHaveBeenCalledWith('acp:agent', expect.any(Number), '> npm test\n1 failing');
    expect(edit).toHaveBeenCalledWith('transcript acp:agent', '/project/.janissary/captures/agent-now.txt', 'active');
  });

  it('routes a monitor-scoped ref to MonitorManager.transcript', () => {
    const edit = vi.fn();
    const transcript = vi.fn(() => 'monitor exchange');
    const managers = makeAcpManagers({ transcript, edit });

    openAcpTranscript(managers, { scope: 'monitor', name: 'security' });

    expect(transcript).toHaveBeenCalledWith('security');
    expect(writeCaptureFile).toHaveBeenCalledWith('monitor:security', expect.any(Number), 'monitor exchange');
    expect(edit).toHaveBeenCalledWith('transcript monitor:security', '/project/.janissary/captures/agent-now.txt', 'active');
  });

  it('routes an editor-scoped ref to EditorAcpManager.transcript', () => {
    const edit = vi.fn();
    const editorTranscript = vi.fn(() => 'persona exchange');
    const managers = makeAcpManagers({ editorTranscript, edit });

    openAcpTranscript(managers, { scope: 'editor', label: 'notes', persona: 'reviewer' });

    expect(editorTranscript).toHaveBeenCalledWith('notes', 'reviewer');
    expect(writeCaptureFile).toHaveBeenCalledWith('reviewer', expect.any(Number), 'persona exchange');
    expect(edit).toHaveBeenCalledWith('transcript reviewer', '/project/.janissary/captures/agent-now.txt', 'active');
  });

  it('substitutes the placeholder when the source is empty, for every scope', () => {
    const edit = vi.fn();
    const managers = makeAcpManagers({ tabs: [], edit });

    openAcpTranscript(managers, { scope: 'tab', label: 'missing' });

    expect(writeCaptureFile).toHaveBeenCalledWith('acp:missing', expect.any(Number), 'No transcript yet.');
  });
});
