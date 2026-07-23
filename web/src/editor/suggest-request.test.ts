import { describe, it, expect } from 'vitest';
import { parseSuggestRequest, personaTokenRange, completePersonaName, suggestPillLabel } from './suggest-request';

const personas = ['summarizer', 'reviewer', 'assistant'];

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

  it('treats a leading >> as a shorthand for > assistant', () => {
    expect(parseSuggestRequest('>> rewrite this paragraph', personas))
      .toEqual({ persona: 'assistant', prompt: 'rewrite this paragraph' });
  });

  it('treats >> as the assistant shorthand even with no space before the prompt', () => {
    expect(parseSuggestRequest('>>rewrite this', personas))
      .toEqual({ persona: 'assistant', prompt: 'rewrite this' });
  });

  it('joins every line after the persona token into a multi-line prompt', () => {
    expect(parseSuggestRequest('> summarizer rewrite this\nin one sentence\nplease', personas))
      .toEqual({ persona: 'summarizer', prompt: 'rewrite this\nin one sentence\nplease' });
  });

  it('still requires the persona token on the first line only', () => {
    expect(parseSuggestRequest('plain text\n> summarizer rewrite this', personas)).toBeUndefined();
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

  it('returns undefined right after a >> assistant shorthand, with no word to complete', () => {
    expect(personaTokenRange('>> rewrite', 3)).toBeUndefined();
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

describe('suggestPillLabel', () => {
  it('returns undefined for a line that is not >-led at all', () => {
    expect(suggestPillLabel('plain text', personas, null, null, null)).toBeUndefined();
  });

  it('shows agent? when no known persona is named yet', () => {
    expect(suggestPillLabel('>', personas, null, null, null)).toEqual({ text: 'agent?', runnable: false });
  });

  it('shows query? when a known persona is named but there is no prompt yet', () => {
    expect(suggestPillLabel('> summarizer', personas, null, null, null)).toEqual({ text: 'query?', runnable: false });
  });

  it('shows run and is runnable once a persona and prompt are both present', () => {
    expect(suggestPillLabel('> summarizer rewrite this', personas, null, null, null))
      .toEqual({ text: 'run', runnable: true });
  });

  it('shows running... while the line is firing', () => {
    const line = '> summarizer rewrite this';
    expect(suggestPillLabel(line, personas, line, null, null)).toEqual({ text: 'running...', runnable: false });
  });

  it('returns undefined for a line whose pending hunk-review panel already owns its state', () => {
    const line = '> summarizer rewrite this';
    expect(suggestPillLabel(line, personas, null, line, null)).toBeUndefined();
  });

  it('shows no suggestion when the last reply for this line came back empty', () => {
    const line = '> summarizer rewrite this';
    expect(suggestPillLabel(line, personas, null, null, line)).toEqual({ text: 'no suggestion', runnable: false });
  });

  it('shows run for a >> assistant shorthand line with a prompt', () => {
    expect(suggestPillLabel('>> rewrite this', personas, null, null, null))
      .toEqual({ text: 'run', runnable: true });
  });

  it('shows query? for a >> assistant shorthand line with no prompt yet', () => {
    expect(suggestPillLabel('>>', personas, null, null, null)).toEqual({ text: 'query?', runnable: false });
  });

  it('shows run for a multi-line query once the first line names a persona and any line has a prompt', () => {
    expect(suggestPillLabel('> summarizer\nrewrite this', personas, null, null, null))
      .toEqual({ text: 'run', runnable: true });
  });

  it('matches running/no-suggestion state against the full multi-line text, not just the first line', () => {
    const text = '> summarizer rewrite\nthis paragraph';
    expect(suggestPillLabel(text, personas, text, null, null)).toEqual({ text: 'running...', runnable: false });
    expect(suggestPillLabel(text, personas, null, null, text)).toEqual({ text: 'no suggestion', runnable: false });
  });
});
