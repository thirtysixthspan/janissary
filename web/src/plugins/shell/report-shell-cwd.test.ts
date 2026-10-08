import { describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';
import { reportShellCwd } from './report-shell-cwd';

function setup(error: Error) {
  const intent = vi.fn(() => Promise.reject(error));
  const reportFailure = vi.fn();
  const capabilities = { intent, reportFailure } as unknown as TabPluginClientCapabilities;
  return { capabilities, intent, reportFailure };
}

describe('reportShellCwd', () => {
  it('does not report a late cwd intent for a tab that has closed as a plugin failure', async () => {
    const { capabilities, intent, reportFailure } = setup(new Error('Plugin tab "bug-repro" not found'));

    reportShellCwd(capabilities, '/remote/work');
    await Promise.resolve();

    expect(intent).toHaveBeenCalledWith('cwd', '/remote/work');
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('still reports other cwd intent failures', async () => {
    const { capabilities, reportFailure } = setup(new Error('cwd intent handler failed'));

    reportShellCwd(capabilities, '/remote/work');
    await Promise.resolve();

    expect(reportFailure).toHaveBeenCalledWith('shell cwd intent failed');
  });
});
