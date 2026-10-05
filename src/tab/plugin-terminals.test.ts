import { describe, expect, it } from 'vitest';
import { ownsTerminal } from './plugin-terminals.js';

const pty = (terminals: Record<string, string>) => ({
  terminalIdFor: (label: string): string | undefined => terminals[label],
});

describe('ownsTerminal', () => {
  it('accepts a plugin tab whose label has a terminal', () => {
    expect(ownsTerminal({ label: 'shell', view: 'plugin' }, pty({ shell: 'pty-1' }))).toBe(true);
  });

  it('refuses a plugin tab without a terminal', () => {
    expect(ownsTerminal({ label: 'viewer', view: 'plugin' }, pty({ shell: 'pty-1' }))).toBe(false);
  });

  it('refuses a tab that is not a plugin tab even when a terminal is registered under its label', () => {
    expect(ownsTerminal({ label: 'janus', view: 'agent' }, pty({ janus: 'pty-2' }))).toBe(false);
    expect(ownsTerminal({ label: 'codex', view: 'harness' }, pty({ codex: 'pty-3' }))).toBe(false);
  });
});
