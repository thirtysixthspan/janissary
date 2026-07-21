import { describe, it, expect } from 'vitest';
import { detectCodexPermissionGate, CODEX_APPROVAL_KEYSTROKE } from './codex-permission-gate.js';

// One rendered-screen fixture per codex 0.144.4 approval-overlay family (see the plan's ground-truth
// table). The selected-row glyph is `›` and every overlay ends in a confirm/cancel footer.
const COMMAND = [
  ' Would you like to run the following command?',
  '',
  '   npm test',
  '',
  ' › 1. Yes, proceed',
  '   2. Yes, and don’t ask again this session',
  '   3. No, provide feedback',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

const NETWORK = [
  ' Do you want to approve network access to "api.example.com"?',
  '',
  '   Reason: fetch dependency metadata',
  '',
  ' › 1. Yes, just this once',
  '   2. Yes, and don’t ask again for this host',
  '   3. No',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

const EDITS = [
  ' Would you like to make the following edits?',
  '',
  '   M src/index.ts',
  '',
  ' › 1. Yes, proceed',
  '   2. No, provide feedback',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

const PERMISSIONS = [
  ' Would you like to grant these permissions?',
  '',
  '   - read files in the workspace',
  '   - run shell commands',
  '',
  ' › 1. Yes, grant these permissions for this turn',
  '   2. No',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

const MCP_ELICITATION = [
  ' The weather server needs your approval.',
  '',
  '   get_forecast(city: "Paris")',
  '',
  ' › 1. Approve get_forecast',
  '   2. Decline',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

const ALL_GATES = { COMMAND, NETWORK, EDITS, PERMISSIONS, MCP_ELICITATION };

describe('detectCodexPermissionGate', () => {
  for (const [name, text] of Object.entries(ALL_GATES)) {
    it(`matches the ${name} overlay`, () => {
      expect(detectCodexPermissionGate(text)).toBe(true);
    });
  }

  it('does not match ordinary output', () => {
    expect(detectCodexPermissionGate('just some codex output\nnothing to approve here')).toBe(false);
  });

  it('does not match a title with no selectable menu', () => {
    const titleOnly = [' Would you like to run the following command?', '', '   npm test'].join('\n');
    expect(detectCodexPermissionGate(titleOnly)).toBe(false);
  });

  it('does not match a menu with no confirm/cancel footer', () => {
    const noFooter = [' Would you like to run the following command?', '', ' › 1. Yes, proceed', '   2. No'].join('\n');
    expect(detectCodexPermissionGate(noFooter)).toBe(false);
  });

  it('does not match when the first option is not highlighted', () => {
    const notHighlighted = [
      ' Would you like to run the following command?',
      '',
      '   1. Yes, proceed',
      '   2. No',
      '',
      ' Press Enter to confirm · Esc to cancel',
    ].join('\n');
    expect(detectCodexPermissionGate(notHighlighted)).toBe(false);
  });

  it('does not match when the highlighted first option is a persistent-allowlist choice', () => {
    const persistent = [
      ' Would you like to run the following command?',
      '',
      '   rm -rf build',
      '',
      ' › 1. Yes, and always allow this command',
      '   2. No',
      '',
      ' Press Enter to confirm · Esc to cancel',
    ].join('\n');
    expect(detectCodexPermissionGate(persistent)).toBe(false);
  });

  it('does not match persistent-choice text without an active overlay', () => {
    const noOverlay = ['   2. Yes, and always allow this command', '   3. No, keep asking'].join('\n');
    expect(detectCodexPermissionGate(noOverlay)).toBe(false);
  });

  it('does not match a resolved overlay sitting above codex’s live composer', () => {
    const stale = [COMMAND, '', '   working on the next step…', '', ' ⏎ send   ⇧⏎ newline'].join('\n');
    expect(detectCodexPermissionGate(stale)).toBe(false);
  });

  it('does not match gate-shaped output quoted back with the composer below', () => {
    const quoted = [MCP_ELICITATION, '', ' > here is what the prompt looked like', '', ' ⏎ send'].join('\n');
    expect(detectCodexPermissionGate(quoted)).toBe(false);
  });
});

describe('CODEX_APPROVAL_KEYSTROKE', () => {
  it('is a carriage return', () => {
    expect(CODEX_APPROVAL_KEYSTROKE).toBe('\r');
  });
});
