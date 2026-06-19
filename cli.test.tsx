import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from './cli.tsx';

describe('App', () => {
  it('renders Hello, World', () => {
    const { lastFrame } = render(<App />);
    expect(lastFrame()).toBe('Hello, World');
  });
});
