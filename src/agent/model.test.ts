import { describe, expect, it } from 'vitest';
import { selectedModel } from './model.js';
const AVAILABLE = ['first', 'google/gemini-3.1-flash-lite'];

describe('agent model selection', () => {
  it('keeps an explicit available model', () => { expect(selectedModel('first', AVAILABLE)).toBe('first'); });
  it('prefers the default when available', () => {
    expect(selectedModel(undefined, AVAILABLE)).toBe('google/gemini-3.1-flash-lite');
  });
  it('falls back to the first model', () => {
    expect(selectedModel(undefined, ['first', 'second'])).toBe('first');
  });
  it.each(['missing', ''])('rejects the explicit unknown model %j', (model) => {
    expect(() => selectedModel(model, AVAILABLE)).toThrow(`Agent: unknown model "${model}".`);
  });
  it('refuses automatic selection from an empty catalog', () => {
    expect(() => selectedModel(undefined, [])).toThrow('Agent: unknown model "".');
  });
});
