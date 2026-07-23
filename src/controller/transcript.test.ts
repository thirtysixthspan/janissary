import { describe, it, expect, vi } from 'vitest';
import { openTranscriptFor, openAcpTranscript } from './transcript.js';
import { writeCaptureFile } from '../harness/capture-file.js';
import type { Managers } from '../managers.js';

vi.mock('../harness/capture-file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/agent-now.txt'),
}));

function makeManagers(tabs: { label: string; log: { input: string; output: string }[] }[], edit = vi.fn()) {
  return {
    tab: { tabs },
    openFile: { edit },
  } as unknown as Managers;
}

function makeAcpManagers(overrides: {
  tabs?: { label: string; log: { input: string; output: string }[] }[];
  transcript?: ReturnType<typeof vi.fn>;
  editorTranscript?: ReturnType<typeof vi.fn>;
  edit?: ReturnType<typeof vi.fn>;
  curLabel?: string;
} = {}) {
  const edit = overrides.edit ?? vi.fn();
  return {
    tab: { tabs: overrides.tabs ?? [], cur: () => ({ label: overrides.curLabel ?? 'active' }) },
    monitor: { transcript: overrides.transcript ?? vi.fn(() => '') },
    editorAcp: { transcript: overrides.editorTranscript ?? vi.fn(() => '') },
    openFile: { edit },
  } as unknown as Managers;
}

describe('openTranscriptFor', () => {
  it('writes the transcript to a file and opens it in an editor tab', () => {
    const edit = vi.fn();
    const managers = makeManagers([{ label: 'agent', log: [{ input: 'npm test', output: '1 failing' }] }], edit);

    openTranscriptFor(managers, 'agent');

    expect(writeCaptureFile).toHaveBeenCalledWith('agent', expect.any(Number), '> npm test\n1 failing');
    expect(edit).toHaveBeenCalledWith('transcript agent', '/project/.janissary/captures/agent-now.txt', 'agent');
  });

  it('is a no-op when the tab does not exist', () => {
    const edit = vi.fn();
    const managers = makeManagers([], edit);
    openTranscriptFor(managers, 'missing');
    expect(edit).not.toHaveBeenCalled();
  });

  it('is a no-op when the tab has an empty log', () => {
    const edit = vi.fn();
    const managers = makeManagers([{ label: 'agent', log: [] }], edit);
    openTranscriptFor(managers, 'agent');
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
