import { describe, it, expect } from 'vitest';
import { parseSuggestRequest, personaTokenRange, completePersonaName } from './suggest-request';

const personas = ['summarizer', 'reviewer'];

describe('parseSuggestRequest', () => {
  it('parses a valid request line', () => {
    expect(parseSuggestRequest('> summarizer rewrite this paragraph', personas))
      .toEqual({ persona: 'summarizer', prompt: 'rewrite this paragraph' });
  });

  it('matches the persona name case-insensitively', () => {
    expect(parseSuggestRequest('> Summarizer rewrite this', personas))
      .toEqual({ persona: 'summarizer', prompt: 'rewrite this' });
  });

  it('handles leading whitespace before the >', () => {
    expect(parseSuggestRequest('   > reviewer check this', personas))
      .toEqual({ persona: 'reviewer', prompt: 'check this' });
  });

  it('is not a request when the first word is not a known persona', () => {
    expect(parseSuggestRequest('> unknown-persona do something', personas)).toBeUndefined();
  });

  it('is not a request for a plain blockquote line', () => {
    expect(parseSuggestRequest('> just a markdown quote', personas)).toBeUndefined();
  });

  it('is not a request for a line with no leading >', () => {
    expect(parseSuggestRequest('summarizer rewrite this', personas)).toBeUndefined();
  });
});

describe('personaTokenRange', () => {
  it('returns the token range when the caret sits inside the persona word', () => {
    expect(personaTokenRange('> summ', 6)).toEqual({ start: 2, end: 6, partial: 'summ' });
  });

  it('returns undefined when the caret has moved past the first word', () => {
    expect(personaTokenRange('> summarizer rewrite', 15)).toBeUndefined();
  });

  it('returns undefined off a non-> line', () => {
    expect(personaTokenRange('plain text', 3)).toBeUndefined();
  });
});

describe('completePersonaName', () => {
  it('completes a unique prefix match', () => {
    expect(completePersonaName('> summ', 6, personas)).toEqual({ start: 2, end: 6, name: 'summarizer' });
  });

  it('returns undefined when no persona matches the prefix', () => {
    expect(completePersonaName('> xyz', 5, personas)).toBeUndefined();
  });

  it('returns undefined off a request line', () => {
    expect(completePersonaName('plain text', 3, personas)).toBeUndefined();
  });
});
