import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './cli.tsx';

describe('App', () => {
  it('renders the header and command bar', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toContain('Custom CLI');
    expect(lastFrame()).toContain('Type "help" for available commands.');
    expect(lastFrame()).toContain('>');
  });
});
