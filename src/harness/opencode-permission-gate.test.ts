import { describe, it, expect } from 'vitest';
import { detectOpencodePermissionGate, OPENCODE_APPROVAL_KEYSTROKE } from './opencode-permission-gate.js';

// The external-directory prompt as reported from opencode 1.18 (see the plan's Goal section).
const EXTERNAL_DIRECTORY = [
  '  ┃',
  '  ┃  △ Permission required',
  '  ┃    ← Access external directory /Users/someone/dev/janissary/.janissary/workspace/opencode/web/src/',
  '  ┃      pickers',
  '  ┃',
  '  ┃  Patterns',
  '  ┃',
  '  ┃  - /Users/someone/dev/janissary/.janissary/workspace/opencode/web/src/pickers/*',
  '  ┃',
  '  ┃',
  '  ┃   Allow once   Allow always   Reject                              ctrl+f fullscreen  ⇆ select  enter confirm',
  '  ┃',
].join('\n');

// A request offering no persistent choice: only `Allow once` and `Reject`.
const NO_ALWAYS_OPTION = [
  '  ┃  △ Permission required',
  '  ┃    $ rm -rf ./temp/scratch',
  '  ┃',
  '  ┃   Allow once   Reject                                         ⇆ select  enter confirm',
].join('\n');

// A narrow terminal wraps the hints onto their own line below the options.
const WRAPPED_FOOTER = [
  '┃  △ Permission required',
  '┃    ← Edit src/index.ts',
  '┃',
  '┃   Allow once   Allow always   Reject',
  '┃   ⇆ select  enter confirm',
].join('\n');

const BORDERLESS = [
  '△ Permission required',
  '  ← Access external directory /tmp',
  'Allow once   Allow always   Reject   ⇆ select  enter confirm',
].join('\n');

describe('detectOpencodePermissionGate', () => {
  it('matches the reported external-directory prompt', () => {
    expect(detectOpencodePermissionGate(EXTERNAL_DIRECTORY)).toBe(true);
  });

  it('matches a prompt that offers no Allow always option', () => {
    expect(detectOpencodePermissionGate(NO_ALWAYS_OPTION)).toBe(true);
  });

  it('matches a prompt whose confirm footer wraps below the options', () => {
    expect(detectOpencodePermissionGate(WRAPPED_FOOTER)).toBe(true);
  });

  it('matches a prompt rendered without the panel border', () => {
    expect(detectOpencodePermissionGate(BORDERLESS)).toBe(true);
  });

  it('does not match ordinary output', () => {
    expect(detectOpencodePermissionGate('Thinking…\n  Read src/index.ts\n  esc interrupt')).toBe(false);
  });

  it('does not match the title without an option row', () => {
    expect(detectOpencodePermissionGate(['┃  △ Permission required', '┃    ← Edit src/index.ts'].join('\n'))).toBe(false);
  });

  it('does not match an option row without the confirm footer', () => {
    const noFooter = ['┃  △ Permission required', '┃   Allow once   Allow always   Reject'].join('\n');
    expect(detectOpencodePermissionGate(noFooter)).toBe(false);
  });

  it('does not match a confirm footer that sits above the option row', () => {
    const footerFirst = ['┃  △ Permission required', '┃   ⇆ select  enter confirm', '┃   Allow once   Reject'].join('\n');
    expect(detectOpencodePermissionGate(footerFirst)).toBe(false);
  });

  it('does not match an option row above the title', () => {
    const optionsFirst = ['┃   Allow once   Reject   enter confirm', '┃  △ Permission required'].join('\n');
    expect(detectOpencodePermissionGate(optionsFirst)).toBe(false);
  });

  it('does not match the Always allow confirmation stage', () => {
    const alwaysStage = [
      '┃  △ Always allow',
      '┃    This will allow the patterns until opencode is restarted',
      '┃   Confirm   Cancel                                            ⇆ select  enter confirm',
    ].join('\n');
    expect(detectOpencodePermissionGate(alwaysStage)).toBe(false);
  });

  it('does not match prose that mentions a required permission', () => {
    const prose = 'The tool said: △ Permission required for this path.\nAllow once or Reject it, then press enter confirm.';
    expect(detectOpencodePermissionGate(prose)).toBe(false);
  });
});

describe('OPENCODE_APPROVAL_KEYSTROKE', () => {
  it('is a carriage return, confirming the highlighted Allow once option', () => {
    expect(OPENCODE_APPROVAL_KEYSTROKE).toBe('\r');
  });
});
