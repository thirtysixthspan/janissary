import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchProfileRunscript } from './runscript.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.length = 0;
});

type EnsureResult = { status: 'ok'; tab: object } | { status: 'failed'; reason: string };

const SHELL_UP: EnsureResult = { status: 'ok', tab: {} };

function setup(script: string, ensureResult = SHELL_UP): {
  file: string;
  output: string[];
  out: (text: string) => void;
  batches: { label: string; lines: string[] }[];
  events: string[];
  managers: never;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'profile-runscript-'));
  directories.push(root);
  const file = path.join(root, 'deploy.rs');
  writeFileSync(file, script);
  const output: string[] = [];
  const out = (text: string) => { output.push(text); };
  const batches: { label: string; lines: string[] }[] = [];
  const events: string[] = [];
  const managers = {
    tab: {
      enqueueSystemBatch: (label: string, lines: string[]) => {
        events.push('enqueue');
        if (lines.length > 0) batches.push({ label, lines });
      },
    },
    systemShell: {
      ensure: async () => {
        events.push('ensure');
        return ensureResult;
      },
    },
  } as never;
  return { file, output, out, batches, events, managers };
}

describe('launchProfileRunscript', () => {
  it('queues the parsed lines to the system shell as one batch and writes nothing', async () => {
    const { file, output, out, batches, events, managers } = setup('cd src\n# comment\n\nharness claude\n');

    await launchProfileRunscript(managers, 'deploy', file, out);

    expect(batches).toEqual([{ label: 'system', lines: ['cd src', 'harness claude'] }]);
    expect(events).toEqual(['ensure', 'enqueue']);
    expect(output).toEqual([]);
  });

  it('queues nothing and writes nothing for an empty runscript', async () => {
    const { file, output, out, batches, managers } = setup('# nothing to run\n');

    await launchProfileRunscript(managers, 'deploy', file, out);

    expect(batches).toEqual([]);
    expect(output).toEqual([]);
  });

  it('reports a symlinked runscript without ensuring the shell', async () => {
    const { file, output, out, events, managers } = setup('echo hi\n');
    const link = path.join(path.dirname(file), 'link.rs');
    symlinkSync(file, link);

    await launchProfileRunscript(managers, 'link', link, out);

    expect(output).toEqual(['Could not read runscript for profile "link".']);
    expect(events).toEqual([]);
  });

  it('reports a runscript that is gone by the time it is read', async () => {
    const { file, output, out, events, managers } = setup('echo hi\n');
    rmSync(file);

    await launchProfileRunscript(managers, 'deploy', file, out);

    expect(output).toEqual(['No profile named "deploy".']);
    expect(events).toEqual([]);
  });

  it('queues nothing and writes nothing when the system shell cannot start', async () => {
    const { file, output, out, batches, managers } = setup('echo hi\n', { status: 'failed', reason: 'no shell' });

    await launchProfileRunscript(managers, 'deploy', file, out);

    expect(batches).toEqual([]);
    expect(output).toEqual([]);
  });
});
