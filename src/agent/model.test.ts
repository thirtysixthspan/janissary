import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectedModel } from './model.js';

const mock = vi.hoisted(() => ({ models: vi.fn() }));
vi.mock('../harness/models.js', () => ({ modelsFor: mock.models }));
beforeEach(() => mock.models.mockReturnValue(['first', 'google/gemini-3.1-flash-lite']));

describe('agent model selection', () => {
  it('keeps an explicit available model', () => { expect(selectedModel('first')).toBe('first'); });
  it('prefers the default when available', () => { expect(selectedModel(undefined)).toBe('google/gemini-3.1-flash-lite'); });
  it('falls back to the first model', () => {
    mock.models.mockReturnValue(['first', 'second']);
    expect(selectedModel(undefined)).toBe('first');
  });
  it.each(['missing', ''])('rejects the explicit unknown model %j', (model) => {
    expect(() => selectedModel(model)).toThrow(`Agent: unknown model "${model}".`);
  });
  it('refuses automatic selection from an empty catalog', () => {
    mock.models.mockReturnValue([]);
    expect(() => selectedModel(undefined)).toThrow('Agent: unknown model "".');
  });
});
