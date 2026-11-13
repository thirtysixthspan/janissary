import { describe, expect, it } from 'vitest';
import { commandProtocolPrimer } from './command-protocol.js';

describe('commandProtocolPrimer', () => {
  const text = commandProtocolPrimer(8);

  it('asks for exactly one plain-text command on the final line', () => {
    expect(text.startsWith('How commands work:')).toBe(true);
    expect(text).toContain('end your reply with exactly one command on its own final line, as plain text: no code fence, no prompt marker, nothing after it.');
  });

  it('says how output returns and that refusals arrive as output', () => {
    expect(text).toContain('starting with "Output of" and the command');
    expect(text).toContain('returns its refusal as that output; do not retry it.');
  });

  it('names the step cap it is given and how to finish', () => {
    expect(text).toContain('At most 8 commands run for one request.');
    expect(commandProtocolPrimer(3)).toContain('At most 3 commands run for one request.');
    expect(text.endsWith('reply with the final answer and no trailing command.')).toBe(true);
  });
});
