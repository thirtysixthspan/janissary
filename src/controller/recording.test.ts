import { describe, it, expect, vi } from 'vitest';
import { openRecordingFor } from './recording.js';
import { playablePluginForExtension } from '../openers/index.js';
import type { Managers } from '../managers.js';

// The recording flag's one action. It has to reach the same opener `open` reaches, because that
// opener is what decides whether the recording is still being written — a fact the client cannot
// work out and the flag's pressable state does not carry.
vi.mock('../openers/index.js', () => ({ playablePluginForExtension: vi.fn(() => 'asciicast') }));

const CAST = '/project/.janissary/recordings/devbox-2026.cast';

function makeManagers(recording: string | undefined) {
  const runOpener = vi.fn(async () => {});
  const managers = {
    harness: { recordingPathOf: vi.fn(() => recording) },
    plugins: { runOpener },
  } as unknown as Managers;
  return { managers, runOpener };
}

describe('openRecordingFor', () => {
  it('opens the named tab\'s recording through the plugin that owns its type', () => {
    const { managers, runOpener } = makeManagers(CAST);

    openRecordingFor(managers, 'devbox');

    // Resolved by extension, the way `open` does it, rather than by naming the asciicast plugin
    // here: which plugin plays a `.cast` is that plugin's declaration to make.
    expect(playablePluginForExtension).toHaveBeenCalledWith('.cast');
    expect(runOpener).toHaveBeenCalledWith('asciicast', 'inline', CAST, expect.objectContaining({ label: 'devbox' }));
  });

  it('opens nothing for a tab with no recording, which is what the inert flag already says', () => {
    const { managers, runOpener } = makeManagers(undefined);

    openRecordingFor(managers, 'devbox');

    expect(runOpener).not.toHaveBeenCalled();
  });

  it('opens nothing when no plugin claims the file as playable', () => {
    const { managers, runOpener } = makeManagers(CAST);
    vi.mocked(playablePluginForExtension).mockReturnValueOnce(undefined);

    openRecordingFor(managers, 'devbox');

    expect(runOpener).not.toHaveBeenCalled();
  });

  it('reports no refusal of its own, because a row button has no transcript to answer one into', () => {
    // The same reason `openHarnessTranscriptFor` no-ops silently rather than returning a string.
    const { managers } = makeManagers(undefined);

    expect(openRecordingFor(managers, 'devbox')).toBeUndefined();
  });
});