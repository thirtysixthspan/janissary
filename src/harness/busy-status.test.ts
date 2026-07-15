import { describe, it, expect, vi } from 'vitest';
import { classifyBusy, busyStatusHandler } from './busy-status.js';
import type { ScreenCapture } from './screen.js';
import type { Managers } from '../managers.js';

// Title fixtures from the live spot-checks (claude 2.1.210, codex-cli 0.144.4).
const CLAUDE_BUSY_TITLE = '⠂ Write a haiku about the sea';
const CLAUDE_IDLE_TITLE = '✳ Claude Code';
const CODEX_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const CODEX_IDLE_TITLE = 'scratchpad';

const CLAUDE_PROMPT_BOX = [
  ' Some earlier output',
  '',
  ' ❯',
  '',
  ' ? for shortcuts',
].join('\n');

const CLAUDE_GENERATING = [
  ' ✻ Deliberating…',
  '',
  ' esc to interrupt',
].join('\n');

// Frames from the live opencode 1.17.18 spot-check: a progress bar while working, an
// `esc interrupt` footer (no "to"), and the idle input box with its command footer.
const OPENCODE_PROGRESS = 'Working on it\n⬝⬝⬝⬝■■■■\n';
const OPENCODE_INTERRUPT = 'Working on it\nesc interrupt\n';
const OPENCODE_IDLE = [
  ' > ',
  '',
  ' tab agents  ctrl+p commands',
].join('\n');

function capture(text: string, title?: string): ScreenCapture {
  return { text, capturedAt: Date.now(), title };
}

describe('classifyBusy — claude', () => {
  it('is busy when the title leads with a Braille spinner glyph', () => {
    expect(classifyBusy(capture('anything', CLAUDE_BUSY_TITLE), 'claude')).toBe('busy');
  });

  it('is ready when the title leads with the ✳ idle marker', () => {
    expect(classifyBusy(capture('anything', CLAUDE_IDLE_TITLE), 'claude')).toBe('ready');
  });

  it('is ready for a live prompt box when no title is present', () => {
    expect(classifyBusy(capture(CLAUDE_PROMPT_BOX), 'claude')).toBe('ready');
  });

  it('is busy for a generating frame when no title is present', () => {
    expect(classifyBusy(capture(CLAUDE_GENERATING), 'claude')).toBe('busy');
  });

  it('does not read the gate\'s highlighted `❯ 1. Yes` option as a prompt box', () => {
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    expect(classifyBusy(capture(gate), 'claude')).toBe('busy');
  });
});

describe('classifyBusy — codex', () => {
  for (const frame of CODEX_SPINNER_FRAMES) {
    it(`is busy for the ${frame} spinner frame leading the title`, () => {
      expect(classifyBusy(capture('anything', `${frame} scratchpad`), 'codex')).toBe('busy');
    });
  }

  it('is ready for a non-Braille title such as the bare cwd basename', () => {
    expect(classifyBusy(capture('anything', CODEX_IDLE_TITLE), 'codex')).toBe('ready');
  });

  it('stays busy before any title has arrived', () => {
    expect(classifyBusy(capture('anything'), 'codex')).toBe('busy');
  });

  it('agrees with claude on the shared leading-Braille title rule', () => {
    for (const title of [CLAUDE_BUSY_TITLE, `${CODEX_SPINNER_FRAMES[0]} scratchpad`, CLAUDE_IDLE_TITLE, CODEX_IDLE_TITLE]) {
      expect(classifyBusy(capture('anything', title), 'codex')).toBe(classifyBusy(capture('anything', title), 'claude'));
    }
  });
});

describe('classifyBusy — opencode', () => {
  it('is busy for a progress-bar run of block/dot glyphs', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS), 'opencode')).toBe('busy');
  });

  it('is busy for the interrupt-hint footer', () => {
    expect(classifyBusy(capture(OPENCODE_INTERRUPT), 'opencode')).toBe('busy');
  });

  it('is ready for the idle input-box frame', () => {
    expect(classifyBusy(capture(OPENCODE_IDLE), 'opencode')).toBe('ready');
  });

  it('ignores the static OpenCode title entirely', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS, 'OpenCode'), 'opencode')).toBe('busy');
    expect(classifyBusy(capture(OPENCODE_IDLE, 'OpenCode'), 'opencode')).toBe('ready');
  });
});

describe('classifyBusy — unknown harness', () => {
  it('returns undefined regardless of input', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS, CLAUDE_BUSY_TITLE), 'mystery')).toBeUndefined();
    expect(classifyBusy(capture(CLAUDE_PROMPT_BOX, CLAUDE_IDLE_TITLE), 'mystery')).toBeUndefined();
  });
});

describe('busyStatusHandler debounce', () => {
  function make(name: string) {
    const tab = { addBusy: vi.fn(), deleteBusy: vi.fn(), markUnread: vi.fn() };
    const handler = busyStatusHandler(name, name, { tab } as unknown as Managers, undefined);
    if (!handler) throw new Error(`no busy entry for ${name}`);
    return { tab, handler };
  }

  const cases = [
    { name: 'claude', busy: capture('anything', CLAUDE_BUSY_TITLE), ready: capture('anything', CLAUDE_IDLE_TITLE) },
    { name: 'codex', busy: capture('anything', '⠹ scratchpad'), ready: capture('anything', CODEX_IDLE_TITLE) },
    { name: 'opencode', busy: capture(OPENCODE_PROGRESS), ready: capture(OPENCODE_IDLE) },
  ];

  for (const { name, busy, ready } of cases) {
    it(`${name}: a single transient ready capture between two busy captures does not clear busy`, () => {
      const { tab, handler } = make(name);
      handler(busy);
      handler(ready);
      handler(busy);
      expect(tab.deleteBusy).not.toHaveBeenCalled();
      expect(tab.addBusy).toHaveBeenCalledTimes(2);
    });

    it(`${name}: two consecutive ready captures clear busy`, () => {
      const { tab, handler } = make(name);
      handler(busy);
      handler(ready);
      handler(ready);
      expect(tab.deleteBusy).toHaveBeenCalledTimes(1);
    });
  }

  it('returns undefined for a harness with no table entry', () => {
    const tab = { addBusy: vi.fn(), deleteBusy: vi.fn(), markUnread: vi.fn() };
    expect(busyStatusHandler('mystery', 'mystery', { tab } as unknown as Managers, undefined)).toBeUndefined();
  });
});
