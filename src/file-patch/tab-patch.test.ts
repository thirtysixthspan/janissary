import { describe, expect, it, vi } from 'vitest';
import { fileOperationReason } from '../file-navigator/file-operation-result.js';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import { CLOSED_REASON, ENDED_REASON, TIMED_OUT_REASON } from '../file-navigator/remote/port-requests.js';
import { REMOTE_UNAVAILABLE } from '../file-read/remote-tab-port.js';
import { runFilePatch } from './tab-patch.js';

const patchLine = String.raw`file patch {"patchText":"*** Add File: a.md\n+x"}`;

function portWith(applyPatch: FileSystemPort['applyPatch']): FileSystemPort {
  return { applyPatch } as unknown as FileSystemPort;
}

function emptyMessageError(): Error {
  const error = new Error('rejected');
  error.message = '';
  return error;
}

describe('runFilePatch', () => {
  it('returns the usage line without calling the port', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>();
    expect(await runFilePatch(portWith(applyPatch), '/root', 'file patch {"patchText":1}'))
      .toBe('Usage: file patch <JSON>');
    expect(applyPatch).not.toHaveBeenCalled();
  });

  it.each([REMOTE_UNAVAILABLE, ENDED_REASON, TIMED_OUT_REASON, CLOSED_REASON])(
    'prints %s unchanged', async (message) => {
      const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => Promise.reject(new Error(message)));
      expect(await runFilePatch(portWith(applyPatch), '/root', patchLine)).toBe(message);
    });

  it('adds the final period to a rejection reason', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => Promise.reject(new Error('boom')));
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine)).toBe('Patch failed: boom.');
  });

  it('escapes a newline in the rejection reason', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => Promise.reject(new Error('bad\nthing')));
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine)).toBe(String.raw`Patch failed: bad\nthing.`);
  });

  it('maps a non-Error rejection through the filesystem reason', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => Promise.reject({ code: 'EACCES' }));
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine))
      .toBe(`Patch failed: ${fileOperationReason({ code: 'EACCES' })}.`);
  });

  it('maps an empty Error message through the filesystem reason', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => Promise.reject(emptyMessageError()));
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine))
      .toBe(`Patch failed: ${fileOperationReason(emptyMessageError())}.`);
  });

  it('catches a synchronous throw from the port', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => { throw new Error('boom'); });
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine)).toBe('Patch failed: boom.');
  });

  it('passes the root and the decoded patch text through unchanged', async () => {
    const applyPatch = vi.fn<FileSystemPort['applyPatch']>(() => 'Patched 1 file:\nA a.md');
    expect(await runFilePatch(portWith(applyPatch), '/root', patchLine)).toBe('Patched 1 file:\nA a.md');
    expect(applyPatch).toHaveBeenCalledWith('/root', '*** Add File: a.md\n+x');
  });
});
