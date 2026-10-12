import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveAgentSnapshot, resolveAgentTask } from './task-resolution.js';
import { resolveAgentSkills } from './skill-grants.js';

let workspace: string;
let installation: string;
let outside: string;
const options = (): { workspaceDir: string; installationDir: string } => ({ workspaceDir: workspace, installationDir: installation });

function writeTask(root: string, relative: string, content: string): string {
  const file = path.join(root, 'ai', 'tasks', relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function writeSkill(root: string, name: string, skill: string, sidecar?: string): void {
  const dir = path.join(root, 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), skill);
  if (sidecar !== undefined) writeFileSync(path.join(dir, 'janissary.json'), sidecar);
}

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'agent-workspace-'));
  installation = mkdtempSync(path.join(tmpdir(), 'agent-install-'));
  outside = mkdtempSync(path.join(tmpdir(), 'agent-outside-'));
  mkdirSync(path.join(workspace, 'ai', 'tasks'), { recursive: true });
  mkdirSync(path.join(installation, 'ai', 'tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(installation, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('resolveAgentTask', () => {
  it('chooses a recursive project task before the installed copy and snapshots its text', () => {
    writeTask(workspace, 'nested/build.md', 'workspace version');
    writeTask(installation, 'nested/build.md', 'installed version');
    const snapshot = resolveAgentTask('build.md', options());
    writeFileSync(snapshot.path, 'edited after resolution');
    expect(snapshot.text).toBe('workspace version');
  });

  it('resolves a project task without walking an unreadable installed task root', () => {
    writeTask(workspace, 'local/task.md', 'workspace task');
    rmSync(path.join(installation, 'ai', 'tasks'), { recursive: true });
    writeFileSync(path.join(installation, 'ai', 'tasks'), 'not a directory');

    expect(resolveAgentTask('task.md', options()).text).toBe('workspace task');
  });

  it('does not fall back to an installed match when the project task root is inaccessible', () => {
    writeTask(installation, 'task.md', 'installed task');
    rmSync(path.join(workspace, 'ai'), { recursive: true, force: true });
    writeFileSync(path.join(workspace, 'ai'), 'not a directory');

    expect(() => resolveAgentTask('task.md', options())).toThrow();
  });

  it('reports ambiguity in the project source without falling back to installation', () => {
    writeTask(workspace, 'one/build.md', 'one');
    writeTask(workspace, 'two/build.md', 'two');
    writeTask(installation, 'build.md', 'installed');
    expect(() => resolveAgentTask('build.md', options())).toThrow('Agent: ambiguous task "build.md": one/build.md, two/build.md.');
  });

  it('rejects a project task root symlinked outside the workspace before discovery', () => {
    writeTask(outside, 'external.md', 'external task');
    rmSync(path.join(workspace, 'ai', 'tasks'), { recursive: true });
    symlinkSync(path.join(outside, 'ai', 'tasks'), path.join(workspace, 'ai', 'tasks'));

    expect(() => resolveAgentTask('external.md', options()))
      .toThrow('Agent: task root outside allowed roots "project".');
  });

  it('does not disclose duplicate task paths from an outside project task root', () => {
    writeTask(outside, 'one/build.md', 'one');
    writeTask(outside, 'two/build.md', 'two');
    rmSync(path.join(workspace, 'ai', 'tasks'), { recursive: true });
    symlinkSync(path.join(outside, 'ai', 'tasks'), path.join(workspace, 'ai', 'tasks'));

    let message = '';
    try {
      resolveAgentTask('build.md', options());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Agent: task root outside allowed roots "project".');
    expect(message).not.toContain(outside);
    expect(message).not.toContain('ambiguous task');
  });

  it('rejects an installed task root symlinked outside the installation before discovery', () => {
    writeTask(outside, 'installed.md', 'external task');
    rmSync(path.join(installation, 'ai', 'tasks'), { recursive: true });
    symlinkSync(path.join(outside, 'ai', 'tasks'), path.join(installation, 'ai', 'tasks'));

    expect(() => resolveAgentTask('installed.md', options()))
      .toThrow('Agent: task root outside allowed roots "janissary".');
  });

  it('rejects explicit installed paths when the installed task root is symlinked outside', () => {
    const externalTask = writeTask(outside, 'explicit.md', 'external task contents');
    rmSync(path.join(installation, 'ai', 'tasks'), { recursive: true });
    symlinkSync(path.join(outside, 'ai', 'tasks'), path.join(installation, 'ai', 'tasks'));

    expect(() => resolveAgentTask('$janissary/ai/tasks/explicit.md', options()))
      .toThrow('Agent: task path outside allowed roots');
    expect(() => resolveAgentTask(externalTask, options()))
      .toThrow('Agent: task path outside allowed roots');
  });

  it('falls back to the installed task and accepts explicit paths only within allowed roots', () => {
    const installed = writeTask(installation, 'deep/installed.md', 'installed task');
    writeTask(workspace, 'deep/project.md', 'project task');
    expect(resolveAgentTask('installed.md', options()).text).toBe('installed task');
    expect(resolveAgentTask(installed, options()).text).toBe('installed task');
    expect(resolveAgentTask('ai/tasks/deep/project.md', options())).toEqual({
      path: path.join(workspace, 'ai', 'tasks', 'deep', 'project.md'),
      text: 'project task',
    });
  });

  it('reports an unreadable installed task root when fallback is needed', () => {
    writeTask(workspace, 'project-only.md', 'workspace task');
    rmSync(path.join(installation, 'ai', 'tasks'), { recursive: true });
    writeFileSync(path.join(installation, 'ai', 'tasks'), 'not a directory');

    expect(() => resolveAgentTask('missing.md', options())).toThrow();
  });

  it('rejects symlink escapes and rejects outside paths before reading', () => {
    const secret = path.join(outside, 'secret.md');
    writeFileSync(secret, 'must not read');
    symlinkSync(secret, path.join(workspace, 'ai', 'tasks', 'escape.md'));
    expect(() => resolveAgentTask('ai/tasks/escape.md', options())).toThrow('Agent: task path outside allowed roots');
    expect(() => resolveAgentTask(secret, options())).toThrow('Agent: task path outside allowed roots');
  });
});

describe('resolveAgentSkills', () => {
  it('deduplicates skills and grants normalized, whole canonical command names', () => {
    writeSkill(installation, 'ask-user', 'Question instructions', '{"version":1,"commands":["Question","question"]}');
    const resolved = resolveAgentSkills(['ask-user', 'ask-user'], options(), ['question', 'browser']);
    expect(resolved.skills).toHaveLength(1);
    expect(resolved.grants).toEqual(['question']);
    writeFileSync(path.join(installation, 'skills', 'ask-user', 'SKILL.md'), 'edited later');
    expect(resolved.skills[0]?.instructions).toBe('Question instructions');
  });

  it('rejects a workspace skills root symlinked outside the workspace before loading content', () => {
    writeSkill(outside, 'external', 'external instructions', '{"version":1,"commands":["question"]}');
    symlinkSync(path.join(outside, 'skills'), path.join(workspace, 'skills'));

    expect(() => resolveAgentSkills(['external'], options(), ['question']))
      .toThrow('Agent: invalid skill path "external".');
  });

  it('rejects an installed skills root symlinked outside the installation before loading content', () => {
    writeSkill(outside, 'external', 'external instructions', '{"version":1,"commands":["question"]}');
    symlinkSync(path.join(outside, 'skills'), path.join(installation, 'skills'));

    expect(() => resolveAgentSkills(['external'], options(), ['question']))
      .toThrow('Agent: invalid skill path "external".');
  });

  it('uses workspace skills first and treats a missing sidecar as no grants', () => {
    writeSkill(workspace, 'local', 'local instructions');
    writeSkill(installation, 'local', 'installed instructions', '{"version":1,"commands":["browser"]}');
    expect(resolveAgentSkills(['local'], options(), ['browser'])).toEqual({
      skills: [{ name: 'local', path: expect.stringContaining(workspace), instructions: 'local instructions' }],
      grants: [],
    });
  });

  it('rejects skill instructions linked to a sibling skill before reading them', () => {
    writeSkill(workspace, 'selected', 'selected instructions');
    writeSkill(workspace, 'sibling', 'sibling instructions');
    const selectedFile = path.join(workspace, 'skills', 'selected', 'SKILL.md');
    rmSync(selectedFile);
    symlinkSync(path.join(workspace, 'skills', 'sibling', 'SKILL.md'), selectedFile);

    expect(() => resolveAgentSkills(['selected'], options(), ['question'])).toThrow('Agent: invalid skill path "selected".');
  });

  it.each([
    ['sibling', () => path.join(workspace, 'skills', 'sibling', 'janissary.json')],
    ['outside', () => path.join(outside, 'grants.json')],
  ])('rejects a %s grant sidecar symlink before reading it', (_target, targetPath) => {
    writeSkill(workspace, 'selected', 'selected instructions');
    writeSkill(workspace, 'sibling', 'sibling instructions', '{"version":1,"commands":["question"]}');
    writeFileSync(targetPath(), '{"version":1,"commands":["question"]}');
    symlinkSync(targetPath(), path.join(workspace, 'skills', 'selected', 'janissary.json'));

    expect(() => resolveAgentSkills(['selected'], options(), ['question'])).toThrow('Agent: invalid skill path "selected".');
  });

  it('rejects malformed declarations and command prefixes not present in the registry', () => {
    writeSkill(installation, 'bad', 'bad', '{"version":2,"commands":[]}');
    expect(() => resolveAgentSkills(['bad'], options(), ['question'])).toThrow('Agent: malformed skill grants "bad".');
    writeSkill(installation, 'prefix', 'prefix', '{"version":1,"commands":["quest"]}');
    expect(() => resolveAgentSkills(['prefix'], options(), ['question'])).toThrow('Agent: unknown command grant "quest" in skill "prefix".');
  });
});

describe('resolveAgentSnapshot', () => {
  it('freezes task text, skill instructions, and grants before later file edits', () => {
    const task = writeTask(workspace, 'snapshot.md', 'task at launch');
    writeSkill(workspace, 'selected', 'skill at launch', '{"version":1,"commands":["question"]}');
    const snapshot = resolveAgentSnapshot('snapshot.md', ['selected'], options(), ['question']);
    writeFileSync(task, 'changed task');
    writeFileSync(path.join(workspace, 'skills', 'selected', 'SKILL.md'), 'changed skill');
    writeFileSync(path.join(workspace, 'skills', 'selected', 'janissary.json'), '{"version":1,"commands":[]}');
    expect(snapshot.taskText).toBe('task at launch');
    expect(snapshot.skills[0]?.instructions).toBe('skill at launch');
    expect(snapshot.grants).toEqual(['question']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.skills)).toBe(true);
    expect(Object.isFrozen(snapshot.grants)).toBe(true);
  });
});
