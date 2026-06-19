import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './cli.js';

describe('App', () => {
  it('renders the header and command bar', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toContain('Janissary');
    expect(lastFrame()).toContain('Type "help" for available commands.');
    expect(lastFrame()).toContain('>');
  });
});
