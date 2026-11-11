import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { agentCredentialEnv, withJanissaryHome } from './environment.js';
import { janissaryRoot } from '../janissary-root.js';
import { initWorkspaceDir } from '../workspace/index.js';
import { workspaceDirectories } from '../workspace/directories.js';

describe('agentCredentialEnv', () => {
  it('maps every harness token to each variable its row names', () => {
    expect(agentCredentialEnv({ claude: 'c', opencode: 'o', kilo: 'k', gemini: 'g' })).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: 'c',
      OPENCODE_API_KEY: 'o',
      KILO_API_KEY: 'k',
      GEMINI_API_KEY: 'g',
      GOOGLE_GENERATIVE_AI_API_KEY: 'g',
    });
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
