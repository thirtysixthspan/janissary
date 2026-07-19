import { describe, it, expect, vi } from 'vitest';
import { openTranscriptFor } from './transcript.js';
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
