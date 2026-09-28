import { describe, expect, it } from 'vitest';
import { forget, learn, readInstruction } from './instructions';

// A rule is prompt text on every turn from here on, so the two cases that matter are the one where a
// message is not a rule and is asked as a question, and the one where it is a rule and is not.

describe('readInstruction', () => {
  it('reads a rule the user asked to be remembered', () => {
    expect(readInstruction('remember: use the median, not the mean')).toEqual({ kind: 'learn', rule: 'use the median, not the mean' });
    expect(readInstruction('Remember: use the median')).toEqual({ kind: 'learn', rule: 'use the median' });
    expect(readInstruction('  remember:   always split by service  ')).toEqual({ kind: 'learn', rule: 'always split by service' });
    expect(readInstruction('forget: never the mean')).toEqual({ kind: 'say', rule: 'never the mean' });
  });

  it('reads a rule the user asked to be forgotten', () => {
    expect(readInstruction('forget: the median thing')).toEqual({ kind: 'say', rule: 'the median thing' });
  });

  // "remember the first deploy" is a question, and a message that happens to contain the word is not an
  // instruction to the host.
  it('treats a sentence that merely contains the word as a message', () => {
    // A message that merely begins with the word is a question, and a swallowed question is worse than a
    // colon the user had to type.
    expect(readInstruction('remember the first deploy of the day')).toEqual({ kind: 'message' });
    expect(readInstruction('forget what I said about deploys')).toEqual({ kind: 'message' });
    expect(readInstruction('what did we agree to remember?')).toEqual({ kind: 'message' });
    expect(readInstruction('chart revenue by region')).toEqual({ kind: 'message' });
    expect(readInstruction('')).toEqual({ kind: 'message' });
  });

  it('treats a rule with nothing after it, or a paragraph after it, as a message', () => {
    expect(readInstruction('remember:')).toEqual({ kind: 'message' });
    expect(readInstruction(`remember: ${'x'.repeat(241)}`)).toEqual({ kind: 'message' });
  });
});

describe('learn', () => {
  it('adds a rule', () => {
    expect(learn([], 'use the median')).toEqual(['use the median']);
  });

  it('does not hold the same rule twice', () => {
    expect(learn(['use the median'], 'use the median')).toEqual(['use the median']);
  });

  it('drops the oldest rather than the newest when the list is full', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `rule ${index}`);
    expect(learn(ten, 'newest')).toEqual([...ten.slice(1), 'newest']);
  });
});

describe('forget', () => {
  // Removal is by containment, because a user forgetting "use the median" will not retype the rule
  // exactly as it was written and a forget that matched nothing would leave them believing it had.
  it('removes the rule it names, and any rule containing it', () => {
    expect(forget(['use the median', 'always split by service'], 'the median')).toEqual(['always split by service']);
    expect(forget(['use the median'], 'median')).toEqual([]);
  });

  it('does not care about case, since a user retyping a rule will not match its capitalisation', () => {
    expect(forget(['Use The Median'], 'use the median')).toEqual([]);
  });

  it('leaves a list alone when nothing matched', () => {
    expect(forget(['use the median'], 'a line chart')).toEqual(['use the median']);
  });
});
