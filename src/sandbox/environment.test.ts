import { describe, expect, it } from 'vitest';
import { agentCredentialEnv } from './environment.js';

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
