import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { agentCredentialEnv, withJanissaryHome, withWorkspaceCredentials, workspaceEnv } from './environment.js';
import { janissaryRoot } from '../janissary-root.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { workspaceDirectories } from '../workspace/directories.js';

describe('agentCredentialEnv', () => {
  it('maps every harness token a spawned process reads to each variable its row names', () => {
    expect(agentCredentialEnv({
      claude: 'c', opencode: 'o', kilo: 'k', gemini: 'g',
    })).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'c',
      OPENCODE_API_KEY: 'o',
      KILO_API_KEY: 'k',
      GEMINI_API_KEY: 'g',
      GOOGLE_GENERATIVE_AI_API_KEY: 'g',
    });
  });

  // The search runs in the janissary process, so an agent outside a workspace has no use for either
  // key even when both token files are configured.
  it('leaves the two search keys out even when they are configured', () => {
    expect(agentCredentialEnv({ tavily: 't', tinyfish: 'tf' })).toEqual({});
  });

  it('leaves the GitHub token and its config redirect out', () => {
    const env = agentCredentialEnv({ github: 'gh', opencode: 'o' });

    expect(env).toEqual({ OPENCODE_API_KEY: 'o' });
    expect(env).not.toHaveProperty('GH_TOKEN');
    expect(env).not.toHaveProperty('GH_CONFIG_DIR');
  });

  it('adds nothing when no token is configured', () => {
    expect(agentCredentialEnv({})).toEqual({});
  });
});

describe('workspace credentials', () => {
  const workspaceDir = path.join(process.cwd(), 'temp', 'workspace credentials');

  it('hands a workspaced spawn every spawned credential but neither search key', () => {
    const env = workspaceEnv(`${workspaceDir}.tmp`, {
      github: 'gh', claude: 'c', opencode: 'o', kilo: 'k', gemini: 'g', tavily: 't', tinyfish: 'tf',
    });

    expect(env.GH_TOKEN).toBe('gh');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('c');
    expect(env.OPENCODE_API_KEY).toBe('o');
    expect(env.KILO_API_KEY).toBe('k');
    expect(env.GEMINI_API_KEY).toBe('g');
    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('g');
    expect(env).not.toHaveProperty('TAVILY_API_KEY');
    expect(env).not.toHaveProperty('TINYFISH_API_KEY');
  });

  it('adds no search key from a configured token on the pass-through path', () => {
    const env = withWorkspaceCredentials(
      { PATH: '/usr/bin' }, { workspaceDir, tokens: { tavily: 't', tinyfish: 'tf' } },
    );

    expect(env).not.toHaveProperty('TAVILY_API_KEY');
    expect(env).not.toHaveProperty('TINYFISH_API_KEY');
  });

  // The pass-through path scrubs nothing else, so this is the one place a credential only the
  // janissary process reads has to be removed by hand.
  it('drops an ambient search key from a pass-through spawn and keeps the rest of the environment', () => {
    const env = withWorkspaceCredentials(
      { PATH: '/usr/bin', TAVILY_API_KEY: 'ambient', TINYFISH_API_KEY: 'ambient', NPM_TOKEN: 'keep' },
      { workspaceDir, tokens: { opencode: 'o' } },
    );

    expect(env.OPENCODE_API_KEY).toBe('o');
    expect(env.NPM_TOKEN).toBe('keep');
    expect(env.PATH).toBe('/usr/bin');
    expect(env).not.toHaveProperty('TAVILY_API_KEY');
    expect(env).not.toHaveProperty('TINYFISH_API_KEY');
  });
});

describe('spawn path environment', () => {
  beforeEach(() => {
    const previous = { ...workspaceDirectories };
    Object.assign(workspaceDirectories, { root: '', workspace: '' });
    return () => { Object.assign(workspaceDirectories, previous); };
  });

  it('uses the current directory before project initialization', () => {
    expect(withJanissaryHome({})).toEqual({
      janissary: janissaryRoot(),
      root: process.cwd(),
      workspace: path.join(process.cwd(), '.janissary', 'workspace'),
    });
  });

  it('overrides inherited paths with initialized project paths and preserves other entries', () => {
    const project = path.join(process.cwd(), 'temp', 'path environment project');
    initWorkspaceDir(project);
    const env = { janissary: '/old/install', root: '/old/project', workspace: '/old/clones', PATH: '/usr/bin' };

    expect(withJanissaryHome(env)).toEqual({
      janissary: janissaryRoot(), root: project, workspace: path.join(project, '.janissary', 'workspace'), PATH: '/usr/bin',
    });
    expect(env.root).toBe('/old/project');
  });

  it('uses the new host project after workspace directories are reinitialized', () => {
    initWorkspaceDir('/local/project');
    initWorkspaceDir('/remote/project');

    expect(withJanissaryHome({ root: '/local/project' })).toEqual({
      janissary: janissaryRoot(), root: '/remote/project', workspace: '/remote/project/.janissary/workspace',
    });
  });
});
