import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from './create.js';

describe('create command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('create');
  });

  it('matches create commands case-insensitively and not similar words', () => {
    expect(command.match('create script deploy')).toBe(true);
    expect(command.match('CREATE script deploy')).toBe(true);
    expect(command.match('created')).toBe(false);
    expect(command.match('edit deploy')).toBe(false);
  });
});

describe('create script', () => {
  const withProject = (test: (root: string) => void) => {
    const root = mkdtempSync(path.join(tmpdir(), 'create-script-'));
    try {
      test(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const harness = (root: string) => {
    const appended: { input: string; output: string }[] = [];
    const targets: { target: string; line?: number }[] = [];
    const managers = {
      tab: {
        launchDir: root,
        cwdOf: () => root,
        append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      },
      openFile: {
        editForCommand: (_command: string, target: string, _label: string, line?: number) => {
          targets.push({ target, line });
        },
      },
    };
    const run = (command_: string) => command.run!(command_, { label: 'janus', index: 0 }, managers as never);
    return { appended, run, targets };
  };

  it('shows usage for a bare create or a create without a name', () => {
    withProject((root) => {
      const { appended, run, targets } = harness(root);

      run('create');
      run('create script');
      run('create harness claude');

      expect(appended.map((entry) => entry.output)).toEqual([
        'Usage: create script <name>', 'Usage: create script <name>', 'Usage: create script <name>',
      ]);
      expect(targets).toEqual([]);
      expect(existsSync(path.join(root, '.janissary'))).toBe(false);
    });
  });

  it('rejects a name that is not a valid runscript name and creates nothing', () => {
    withProject((root) => {
      const { appended, run, targets } = harness(root);

      run('create script Deploy');
      run('create script deploy-');

      expect(appended.map((entry) => entry.output)).toEqual([
        'Invalid runscript name "Deploy". Use lowercase words separated by single hyphens.',
        'Invalid runscript name "deploy-". Use lowercase words separated by single hyphens.',
      ]);
      expect(targets).toEqual([]);
      expect(existsSync(path.join(root, '.janissary'))).toBe(false);
    });
  });

  it('creates the scripts directory and an empty runscript, then opens that file in the editor', () => {
    withProject((root) => {
      const { appended, run, targets } = harness(root);
      const file = path.join(root, '.janissary', 'scripts', 'deploy.rs');

      run('create script deploy');

      expect(readFileSync(file, 'utf8')).toBe('');
      expect(appended).toEqual([{ input: 'create script deploy', output: '' }]);
      expect(targets).toEqual([{ target: file, line: undefined }]);
    });
  });

  it('opens an existing runscript unchanged and says it already exists', () => {
    withProject((root) => {
      const scripts = path.join(root, '.janissary', 'scripts');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(path.join(scripts, 'deploy.rs'), 'echo kept\n');
      const { appended, run, targets } = harness(root);

      run('create script deploy');

      expect(readFileSync(path.join(scripts, 'deploy.rs'), 'utf8')).toBe('echo kept\n');
      expect(appended).toEqual([{ input: 'create script deploy', output: 'Runscript "deploy" already exists.' }]);
      expect(targets).toEqual([{ target: path.join(scripts, 'deploy.rs'), line: undefined }]);
    });
  });

  it('reports a failed creation and opens nothing when the scripts path is unsafe', () => {
    withProject((root) => {
      mkdirSync(path.join(root, '.janissary'), { recursive: true });
      symlinkSync(root, path.join(root, '.janissary', 'scripts'));
      const { appended, run, targets } = harness(root);

      run('create script deploy');

      expect(appended).toEqual([{ input: 'create script deploy', output: 'Could not create runscript "deploy".' }]);
      expect(targets).toEqual([]);
    });
  });
});
