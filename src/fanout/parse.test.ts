import { describe, it, expect } from 'vitest';
import { parseFanout, FANOUT_USAGE, MAX_FANOUT_MEMBERS } from './parse.js';

const model = 'opencode/big-pickle';
const other = 'opencode/muse-spark-1.3-contributor-free';

describe('parseFanout', () => {
  it('reads the leading members and takes the whole rest of the line as the prompt', () => {
    expect(parseFanout(`fanout opencode:${model} opencode:${other} what does this repository do?`))
      .toEqual({ members: [model, other], prompt: 'what does this repository do?' });
  });

  it('keeps a colon inside the prompt', () => {
    expect(parseFanout(`fanout opencode:${model} fix: the flaky logout test`))
      .toEqual({ members: [model], prompt: 'fix: the flaky logout test' });
  });

  it('accepts a single member', () => {
    expect(parseFanout(`fanout opencode:${model} explain this`))
      .toEqual({ members: [model], prompt: 'explain this' });
  });

  it('accepts the maximum member count', () => {
    const members = Array.from({ length: MAX_FANOUT_MEMBERS }, (_, i) => `opencode:m${i}`);
    expect(parseFanout(`fanout ${members.join(' ')} go`))
      .toEqual({ members: members.map((m) => m.slice('opencode:'.length)), prompt: 'go' });
  });

  it('refuses a count above the maximum', () => {
    const members = Array.from({ length: MAX_FANOUT_MEMBERS + 1 }, (_, i) => `opencode:m${i}`);
    expect(parseFanout(`fanout ${members.join(' ')} go`)).toEqual({ error: FANOUT_USAGE });
  });

  it('refuses an empty member list with the exact usage wording', () => {
    expect(parseFanout('fanout what does this repository do?')).toEqual({ error: FANOUT_USAGE });
  });

  it('refuses a missing prompt', () => {
    expect(parseFanout(`fanout opencode:${model}`)).toEqual({ error: FANOUT_USAGE });
  });

  it('refuses a bare command', () => {
    expect(parseFanout('fanout')).toEqual({ error: FANOUT_USAGE });
  });

  it('refuses an empty model after the harness prefix', () => {
    expect(parseFanout('fanout opencode: do the thing')).toEqual({ error: FANOUT_USAGE });
  });

  it('refuses a member naming a harness other than opencode, naming that harness', () => {
    const parsed = parseFanout('fanout claude:some-model do the thing');
    expect(parsed).toEqual({
      error: 'A fanout member must be an opencode model, not claude. ' + FANOUT_USAGE,
    });
  });

  it('refuses codex as a member too', () => {
    expect(parseFanout('fanout codex:gpt-5 go')).toHaveProperty('error');
  });

  it('accepts the member prefix in any case', () => {
    expect(parseFanout(`fanout OpenCode:${model} go`)).toEqual({ members: [model], prompt: 'go' });
  });
});
