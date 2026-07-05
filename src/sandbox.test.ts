import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from './config.js';
import { sandboxAvailable, sandboxSpawn } from './sandbox.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './sandbox-profile.js';

function parenDepth(text: string): number {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth;
}

describe('sandbox-profile constants', () => {
  it('SANDBOX_PROFILE and SANDBOX_PROFILE_OFFLINE have balanced parentheses', () => {
    expect(parenDepth(SANDBOX_PROFILE)).toBe(0);
    expect(parenDepth(SANDBOX_PROFILE_OFFLINE)).toBe(0);
  });

  it('the offline variant denies network, the default variant allows it', () => {
    expect(SANDBOX_PROFILE).toContain('(allow network*)');
    expect(SANDBOX_PROFILE).not.toContain('(deny network*)');
    expect(SANDBOX_PROFILE_OFFLINE).toContain('(deny network*)');
  });
});

describe('sandboxSpawn', () => {
  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
  });

  it('returns the input unchanged when workspaceDir is undefined', () => {
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({}, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env });
  });

  it('returns the input unchanged when sandboxWorkspaces is configured off', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-off-'));
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'config.json'), JSON.stringify({ sandboxWorkspaces: false }));
    loadConfig(dir);
    const env = { PATH: '/usr/bin' };
    const result = sandboxSpawn({ workspaceDir: '/tmp/whatever' }, 'bash', ['-lc', 'echo hi'], env);
    expect(result).toEqual({ command: 'bash', args: ['-lc', 'echo hi'], env });
  });

  it('wraps the command in sandbox-exec when a workspaceDir is given and sandboxing is available', () => {
    if (!sandboxAvailable()) return; // covered by the identity-passthrough case elsewhere
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', ['-lc', 'echo hi']);
    expect(result.command).toBe('sandbox-exec');
    expect(result.args[0]).toBe('-p');
    expect(result.args).toContain('--');
    const tail = result.args.slice(result.args.indexOf('--') + 1);
    expect(tail).toEqual(['bash', '-lc', 'echo hi']);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('includes every -D param the profile references', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    const dNames = result.args.filter((_, i) => result.args[i - 1] === '-D').map((v) => v.split('=', 1)[0]);
    for (const required of ['WORKSPACE', 'TMPDIR', 'HOME', 'GIT_OBJECTS']) {
      expect(dNames).toContain(required);
    }
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('scrubs credential-shaped vars and agent-socket escape vectors, keeping provider keys', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = {
      PATH: '/usr/bin',
      AWS_SECRET_ACCESS_KEY: 'x', GITHUB_TOKEN: 'x', GH_TOKEN: 'x', NPM_TOKEN: 'x',
      DOCKER_HOST: 'x', KUBECONFIG: 'x', SOME_SECRET: 'x', SOME_PASSWORD: 'x',
      SSH_AUTH_SOCK: 'x', GPG_AGENT_INFO: 'x', GIT_ASKPASS: 'x', GIT_CREDENTIAL_HELPER: 'x', KRB5CCNAME: 'x',
      ANTHROPIC_API_KEY: 'keep-me', OPENAI_API_KEY: 'keep-me', GOOGLE_API_KEY: 'keep-me',
    };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    for (const dropped of [
      'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'DOCKER_HOST', 'KUBECONFIG',
      'SOME_SECRET', 'SOME_PASSWORD', 'SSH_AUTH_SOCK', 'GPG_AGENT_INFO', 'GIT_ASKPASS',
      'GIT_CREDENTIAL_HELPER', 'KRB5CCNAME',
    ]) {
      expect(result.env[dropped]).toBeUndefined();
    }
    expect(result.env.ANTHROPIC_API_KEY).toBe('keep-me');
    expect(result.env.OPENAI_API_KEY).toBe('keep-me');
    expect(result.env.GOOGLE_API_KEY).toBe('keep-me');
    expect(result.env.PATH).toBe('/usr/bin');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects GH_TOKEN when githubToken is given, overriding the scrub', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir, githubToken: 'scoped-token' }, 'bash', [], env);
    expect(result.env.GH_TOKEN).toBe('scoped-token');
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('does not set GH_TOKEN when githubToken is omitted, even if the ambient env has one', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const env = { PATH: '/usr/bin', GH_TOKEN: 'ambient-token' };
    const result = sandboxSpawn({ workspaceDir }, 'bash', [], env);
    expect(result.env.GH_TOKEN).toBeUndefined();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('sets TMPDIR to the workspace-adjacent temp dir', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir }, 'bash', []);
    expect(result.env.TMPDIR).toContain(`${path.basename(workspaceDir)}.tmp`);
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('uses the offline profile variant when offline is set', () => {
    if (!sandboxAvailable()) return;
    const workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    const result = sandboxSpawn({ workspaceDir, offline: true }, 'bash', []);
    expect(result.args[1]).toBe(SANDBOX_PROFILE_OFFLINE);
    rmSync(workspaceDir, { recursive: true, force: true });
  });
});
