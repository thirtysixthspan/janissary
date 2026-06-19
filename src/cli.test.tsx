import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './cli.js';

describe('App', () => {
  it('renders at startup without throwing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('produces a non-empty frame on startup', () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame();
    expect(frame).toBeTruthy();
    expect(frame!.length).toBeGreaterThan(0);
  });

  it('renders only the janus tab, placeholder, and command bar on startup', () => {
    const { lastFrame } = render(<App />);
    const frame = lastFrame();
    expect(frame).toContain('janus');
    expect(frame).not.toContain('refactor');
    expect(frame).not.toContain('scratch');
    expect(frame).toContain('>');
  });
});
