import { describe, it, expect } from 'vitest';
import { errorText } from './error-text.js';

class ParseFailure extends Error {}

describe('errorText', () => {
  it('returns the message of an Error', () => {
    expect(errorText(new Error('boom'))).toBe('boom');
  });

  it('returns the message of an Error subclass', () => {
    expect(errorText(new ParseFailure('bad token'))).toBe('bad token');
  });

  it('returns the empty message of an Error that carries none', () => {
    const blank = new Error('placeholder');
    blank.message = '';
    expect(errorText(blank)).toBe('');
  });

  it('returns a thrown string unchanged', () => {
    expect(errorText('not an error')).toBe('not an error');
  });

  it('stringifies a thrown object', () => {
    expect(errorText({ toString: () => 'custom failure' })).toBe('custom failure');
  });

  it('stringifies a thrown number', () => {
    expect(errorText(42)).toBe('42');
  });

  it('stringifies undefined and null', () => {
    expect(errorText(undefined)).toBe('undefined');
    expect(errorText(null)).toBe('null');
  });
});
