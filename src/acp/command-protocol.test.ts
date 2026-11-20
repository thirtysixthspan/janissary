import { describe, expect, it } from 'vitest';
import { commandProtocolPrimer } from './command-protocol.js';

describe('commandProtocolPrimer', () => {
  const text = commandProtocolPrimer(8);

  it('groups several labelled janissary blocks in one reply into a batch', () => {
    expect(text.startsWith('How commands work:')).toBe(true);
    expect(text).toContain('put it inside a fenced block whose info string is exactly `janissary`');
    expect(text).toContain('Several such blocks in one reply form a batch; each block holds one command');
  });

  it('says the batch runs in parallel and each result returns as its own follow-up', () => {
    expect(text).toContain('All commands in a batch run in parallel.');
    expect(text).toContain('Each result comes back as its own message starting with "Output of" and the command.');
    expect(text).toContain('starting with "Output of" and the command');
    expect(text).toContain('Read it, then send another batch or give the final answer.');
    expect(text).toContain('returns its refusal as that output; do not retry it.');
  });

  it('names the step cap it is given and how to finish', () => {
    expect(text).toContain('At most 8 commands run for one request, counting every command in a batch.');
    expect(commandProtocolPrimer(3)).toContain('At most 3 commands run for one request, counting every command in a batch.');
    expect(text.endsWith('reply with the final answer and no trailing command.')).toBe(true);
  });
});
