import { describe, expect, it } from 'vitest';
import { extractAgentCommand } from './command-extract.js';

describe('extractAgentCommand', () => {
  it('extracts only a final command outside fenced examples', () => {
    expect(extractAgentCommand('janissary question ask "old"\n\n```\njanissary question ask "example"\n```', true)).toBe('question ask "old"');
    expect(extractAgentCommand('janissary question ask "example"\n\nDone.', true)).toBeNull();
    expect(extractAgentCommand('Answer\njanissary question ask "real"', true)).toBe('question ask "real"');
    expect(extractAgentCommand('question ask "no skill"', false)).toBeNull();
  });

  it('ignores tilde-fenced commands until a matching fence closes', () => {
    expect(extractAgentCommand('~~~text\njanissary question ask "hidden"\n~~~', true)).toBeNull();
    expect(extractAgentCommand('~~~\nquestion ask "hidden"\n~~~', true)).toBeNull();
    expect(extractAgentCommand('~~~\nquestion ask "hidden"\n```\nquestion ask "still hidden"\n~~~\nDone.', true)).toBeNull();
    expect(extractAgentCommand(
      '~~~~ ts\njanissary question ask "hidden"\n~~~\njanissary question ask "still hidden"\n~~~~\njanissary question ask "real"',
      true,
    )).toBe('question ask "real"');
    expect(extractAgentCommand('~~~\nquestion ask "hidden"\n~~~\nquestion ask "real"', true)).toBe('question ask "real"');
  });

});
