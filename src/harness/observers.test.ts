import { describe, it, expect, vi, beforeEach } from 'vitest';
import { harnessRuntime } from './observers.js';
import { HarnessScreenReader } from './screen.js';
import { captureWiring } from './capture-wire.js';
import type { Managers } from '../managers.js';
import type { RemoteChannel } from '../remote/channel.js';

// `harnessRuntime()` has no dedicated test file today (`observers.test.ts` — the wiring it does is
// only exercised indirectly through `harness/manager.test.ts`). This covers the one branch the
// auto-accept-while-detached plan adds: a remote harness tab (`channel` set) gets no local screen
// reader or capture wiring at all — gate-detection, auto-approve, and busy status run server-side for
// it now — while everything else (recorder, transcript tailer) stays exactly as it is for a local tab.

vi.mock('../notifications.js', () => ({ notify: vi.fn() }));
vi.mock('./capture-wire.js', () => ({ captureWiring: vi.fn(() => ({})) }));
vi.mock('./transcript/sources.js', () => ({ createTranscriptSource: vi.fn() }));

const recorderMock = vi.hoisted(() => ({ instances: [] as { dispose: ReturnType<typeof vi.fn> }[] }));
vi.mock('./recorder.js', () => ({
  HarnessRecorder: vi.fn(function () {
    const instance = { dispose: vi.fn() };
    recorderMock.instances.push(instance);
    return instance;
  }),
}));

const tailerMock = vi.hoisted(() => ({ instances: [] as { dispose: ReturnType<typeof vi.fn> }[] }));
vi.mock('./transcript/tailer.js', () => ({
  HarnessTranscriptTailer: vi.fn(function () {
    const instance = { dispose: vi.fn() };
    tailerMock.instances.push(instance);
    return instance;
  }),
}));

function makeManagers(transcriptSource?: unknown): Managers {
  return {
    pty: { spawnDimensions: () => ({ cols: 80, rows: 24 }), input: vi.fn() },
    remote: { transcriptSource: vi.fn(() => transcriptSource) },
  } as unknown as Managers;
}

describe('harnessRuntime', () => {
  beforeEach(() => {
    recorderMock.instances.length = 0;
    tailerMock.instances.length = 0;
    vi.mocked(captureWiring).mockClear();
  });

  it('builds a real local screen reader and calls captureWiring for a local tab', () => {
    const managers = makeManagers();
    const runtime = harnessRuntime({
      managers, name: 'claude', label: 'claude', id: 'pty-1', cwd: '/repo', autoApprove: false, channel: undefined,
    });
    try {
      expect(runtime.reader).toBeInstanceOf(HarnessScreenReader);
      expect(captureWiring).toHaveBeenCalledWith(managers, 'claude', 'claude', 'pty-1', false);
      expect(recorderMock.instances).toHaveLength(1);
    } finally { runtime.dispose(); }
  });

  it('builds no screen reader and skips captureWiring for a remote tab', () => {
    const managers = makeManagers('remote transcript source');
    const runtime = harnessRuntime({
      managers, name: 'claude', label: 'claude', id: 'r1', cwd: '/repo', autoApprove: true,
      channel: {} as unknown as RemoteChannel,
    });
    try {
      expect(runtime.reader).toBeUndefined();
      expect(runtime.autoApprover).toBeUndefined();
      expect(captureWiring).not.toHaveBeenCalled();
      // The recorder and transcript tailer are unaffected — a remote tab still asciicast-records
      // locally and still tails a transcript, just from the far side's channel instead of a local
      // dot directory.
      expect(recorderMock.instances).toHaveLength(1);
      expect(tailerMock.instances).toHaveLength(1);
      expect(managers.remote.transcriptSource).toHaveBeenCalledWith('claude');
    } finally { runtime.dispose(); }
  });

  it('disposes cleanly with no reader to dispose (a remote tab\'s runtime)', () => {
    const managers = makeManagers();
    const runtime = harnessRuntime({
      managers, name: 'claude', label: 'claude', id: 'r1', cwd: '/repo', autoApprove: false,
      channel: {} as unknown as RemoteChannel,
    });
    expect(() => runtime.dispose()).not.toThrow();
    expect(recorderMock.instances[0]?.dispose).toHaveBeenCalled();
  });
});
