import { describe, it, expect } from 'vitest';
import { parseHarnessCommand } from './command-parse.js';

// The helpers (findFlagValue, splitWithClause, parseHarnessFlags, parseLabelSubcommand) are
// module-private, so every branch is reached through the exported entry point.

describe('parseHarnessCommand — launch form', () => {
  it('defaults a supported harness to workspace and auto-approve', () => {
    expect(parseHarnessCommand('harness claude')).toEqual({
      name: 'claude',
      workspace: true,
      offline: false,
      autoApprove: true,
      browser: false,
    });
  });

  it('defaults an unsupported harness to workspace without auto-approve', () => {
    expect(parseHarnessCommand('harness opencode')).toMatchObject({ workspace: true, autoApprove: false });
  });

  it('accepts workspace and auto-approve opt-outs', () => {
    expect(parseHarnessCommand('harness claude --no-workspace --no-auto-approve')).toMatchObject({
      workspace: false, autoApprove: false,
    });
  });

  it('lets negative flags override positive flags', () => {
    expect(parseHarnessCommand('harness claude -w --no-workspace -y --no-auto-approve')).toMatchObject({
      workspace: false, autoApprove: false,
    });
  });

  it('accepts both spellings of the workspace flag', () => {
    expect(parseHarnessCommand('harness claude -w')).toMatchObject({ workspace: true });
    expect(parseHarnessCommand('harness claude --workspace')).toMatchObject({ workspace: true });
  });

  it('accepts both spellings of the auto-approve flag', () => {
    expect(parseHarnessCommand('harness claude -y')).toMatchObject({ autoApprove: true });
    expect(parseHarnessCommand('harness codex --yes')).toMatchObject({ autoApprove: true });
  });

  it('parses --offline', () => {
    expect(parseHarnessCommand('harness claude -w --offline')).toMatchObject({ workspace: true, offline: true });
  });

  it('lower-cases the harness name', () => {
    expect(parseHarnessCommand('harness CLAUDE')).toMatchObject({ name: 'claude' });
  });

  it('parses --model and --effort values', () => {
    expect(parseHarnessCommand('harness claude --model opus --effort high')).toMatchObject({
      model: 'opus',
      effort: 'high',
    });
  });

  it('parses a trailing as <label>', () => {
    expect(parseHarnessCommand('harness claude as reviewer')).toMatchObject({ label: 'reviewer' });
  });

  it('parses every option together, in any order', () => {
    expect(parseHarnessCommand('harness codex --effort low as bot -y --offline -b --model gpt-5 -w')).toEqual({
      name: 'codex',
      workspace: true,
      offline: true,
      autoApprove: true,
      browser: true,
      model: 'gpt-5',
      effort: 'low',
      label: 'bot',
    });
  });
});

describe('parseHarnessCommand — -b/--browser', () => {
  it('defaults to false', () => {
    expect(parseHarnessCommand('harness claude')).toMatchObject({ browser: false });
  });

  it('accepts both spellings', () => {
    expect(parseHarnessCommand('harness claude -b')).toMatchObject({ browser: true });
    expect(parseHarnessCommand('harness claude --browser')).toMatchObject({ browser: true });
    expect(parseHarnessCommand('harness claude --BROWSER')).toMatchObject({ browser: true });
  });

  // Unlike -y, nothing here is harness-specific: every harness gets the same two variables, so there
  // is no rejection branch to exercise.
  it('is accepted for every harness with no rejection case', () => {
    for (const name of ['claude', 'codex', 'opencode']) {
      expect(parseHarnessCommand(`harness ${name} -b --no-auto-approve`)).toMatchObject({ name, browser: true });
    }
  });

  it('works with or without a workspace', () => {
    expect(parseHarnessCommand('harness claude -b --no-workspace')).toMatchObject({ browser: true, workspace: false });
    expect(parseHarnessCommand('harness claude -b -w')).toMatchObject({ browser: true, workspace: true });
  });

  // Deliberately contradictory and deliberately not rejected: both flags apply, and the offline
  // profile then denies the harness the network route to its own browser (see the plan's decision
  // 18 and `ai/guidelines/sandbox-e2e-browser.md`).
  it('parses cleanly alongside --offline', () => {
    expect(parseHarnessCommand('harness claude -b --offline')).toMatchObject({ browser: true, offline: true });
  });

  it('combines with the other flags and clauses in any order', () => {
    expect(parseHarnessCommand('harness claude -b on devbox as bot --model opus')).toMatchObject({
      browser: true, label: 'bot', model: 'opus', workspace: true,
    });
    expect(parseHarnessCommand('harness claude as bot --model opus -b')).toMatchObject({
      browser: true, label: 'bot', model: 'opus',
    });
  });

  // `-b` inside the prompt is prompt text: the clause is split off before any option scanning.
  it('is not scanned inside a with <prompt> clause', () => {
    expect(parseHarnessCommand('harness claude with try -b now')).toMatchObject({
      browser: false, prompt: 'try -b now',
    });
  });
});

describe('parseHarnessCommand — on <address> clause', () => {
  it('parses the address into its destination, bare host, and path', () => {
    expect(parseHarnessCommand('harness claude on admin@devbox:/srv/proj')).toMatchObject({
      remote: { address: 'admin@devbox:/srv/proj', destination: 'admin@devbox', host: 'devbox', path: '/srv/proj' },
    });
  });

  // The remote server's only job is to provision a clone from its project root, so a remote launch
  // without a workspace has no meaning — the clause turns it on rather than erroring.
  it('forces workspace true without -w', () => {
    expect(parseHarnessCommand('harness claude on devbox')).toMatchObject({ workspace: true });
  });

  it('accepts -w alongside it, meaning the same thing', () => {
    expect(parseHarnessCommand('harness claude -w on devbox')).toMatchObject({ workspace: true });
  });

  it('is case-insensitive on the clause keyword', () => {
    expect(parseHarnessCommand('harness claude ON devbox')).toMatchObject({ remote: { host: 'devbox' } });
  });

  it('parses from any position among the other flags', () => {
    expect(parseHarnessCommand('harness codex on devbox --effort low as bot -y --model gpt-5')).toMatchObject({
      name: 'codex', autoApprove: true, model: 'gpt-5', effort: 'low', label: 'bot',
      workspace: true, remote: { host: 'devbox' },
    });
  });

  it('parses the same options in any other order', () => {
    expect(parseHarnessCommand('harness codex --model gpt-5 as bot --effort low on admin@devbox -y')).toMatchObject({
      name: 'codex', autoApprove: true, model: 'gpt-5', effort: 'low', label: 'bot',
      remote: { destination: 'admin@devbox' },
    });
  });

  it('leaves remote unset when there is no clause', () => {
    expect(parseHarnessCommand('harness claude -w')).toMatchObject({ remote: undefined });
  });

  it('errors when on has no following address', () => {
    expect(parseHarnessCommand('harness claude on')).toEqual({ error: expect.stringContaining('Usage: on') });
  });

  it('errors on an address carrying a shell metacharacter', () => {
    expect(parseHarnessCommand('harness claude on devbox;id')).toEqual({
      error: expect.stringContaining('devbox;id'),
    });
  });

  // `splitWithClause` peels the prompt off before any option scanning, so an `on` inside prompt text
  // is never read as a clause.
  it('leaves an on inside a with <prompt> clause as prompt text', () => {
    expect(parseHarnessCommand('harness claude with turn it on devbox')).toEqual({
      name: 'claude', workspace: true, offline: false, autoApprove: true, browser: false,
      prompt: 'turn it on devbox',
    });
  });

  it('parses a real clause to the left of a prompt containing the word on', () => {
    expect(parseHarnessCommand('harness claude on devbox with switch it on')).toMatchObject({
      workspace: true, remote: { host: 'devbox' }, prompt: 'switch it on',
    });
  });
});

describe('parseHarnessCommand — with <prompt> clause', () => {
  it('captures the prompt and keeps it out of option parsing', () => {
    expect(parseHarnessCommand('harness claude with fix the -w flag')).toEqual({
      name: 'claude',
      workspace: true,
      offline: false,
      autoApprove: true,
      browser: false,
      prompt: 'fix the -w flag',
    });
  });

  it('preserves internal spacing in the prompt verbatim', () => {
    expect(parseHarnessCommand('harness claude with  keep   these   spaces')).toMatchObject({
      prompt: 'keep   these   spaces',
    });
  });

  it('parses options to the left of the clause', () => {
    expect(parseHarnessCommand('harness claude -w as bot with run the tests')).toMatchObject({
      workspace: true,
      label: 'bot',
      prompt: 'run the tests',
    });
  });

  it('does not treat a with-prefixed word as the clause keyword', () => {
    expect(parseHarnessCommand('harness claude as without')).toMatchObject({ label: 'without', prompt: undefined });
  });
});

describe('parseHarnessCommand — capture and transcript subcommands', () => {
  it('parses capture <label>', () => {
    expect(parseHarnessCommand('harness capture reviewer')).toEqual({ capture: true, label: 'reviewer' });
  });

  it('parses transcript <label>', () => {
    expect(parseHarnessCommand('harness transcript reviewer')).toEqual({ transcript: true, label: 'reviewer' });
  });

  it('is case-insensitive on the subcommand keyword', () => {
    expect(parseHarnessCommand('harness CAPTURE bot')).toEqual({ capture: true, label: 'bot' });
  });
});

describe('parseHarnessCommand — error paths', () => {
  it('errors on a bare harness command', () => {
    expect(parseHarnessCommand('harness')).toEqual({ error: expect.stringContaining('Usage: harness') });
  });

  it('errors on an unknown harness name', () => {
    expect(parseHarnessCommand('harness bogus')).toEqual({
      error: expect.stringContaining('Unknown harness "bogus"'),
    });
  });

  it('errors when auto-approve is asked of an unsupported harness', () => {
    expect(parseHarnessCommand('harness opencode -y')).toEqual({
      error: '-y/--yes is only supported for the claude and codex harnesses.',
    });
  });

  it('errors when --model has no value', () => {
    expect(parseHarnessCommand('harness claude --model')).toEqual({
      error: expect.stringContaining('--model <value>'),
    });
  });

  it('errors when --effort has no value', () => {
    expect(parseHarnessCommand('harness claude --effort')).toEqual({
      error: expect.stringContaining('--effort <value>'),
    });
  });

  it('errors when as has no label', () => {
    expect(parseHarnessCommand('harness claude as')).toEqual({
      error: expect.stringContaining('as <label>'),
    });
  });

  it('errors when with has no prompt', () => {
    expect(parseHarnessCommand('harness claude with')).toEqual({
      error: expect.stringContaining('with <prompt>'),
    });
  });

  it('errors when the clause leaves no harness name', () => {
    expect(parseHarnessCommand('harness with do something')).toEqual({
      error: expect.stringContaining('Unknown harness'),
    });
  });

  it('errors when capture has no label', () => {
    expect(parseHarnessCommand('harness capture')).toEqual({ error: 'Usage: harness capture <name>.' });
  });

  it('errors when transcript has no label', () => {
    expect(parseHarnessCommand('harness transcript')).toEqual({ error: 'Usage: harness transcript <name>.' });
  });
});
