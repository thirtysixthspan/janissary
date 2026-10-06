import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZshStartupDirectory } from './zsh-startup-directory.js';
import { shellStartupEnvironment } from './zsh-startup-script.js';

// The startup files against the real zsh, in a real pseudo-terminal: the only way to see what zsh's
// history holds, since that is decided inside zsh's own line reader.

const ZSH = '/bin/zsh';
const NONCE = '0123456789abcdef'.repeat(2);
const PROMPT_MARKER = `\u{1B}]133;D;${NONCE}\u{7}`;
const SETUP_MARKER = `\u{1B}]133;E;${NONCE}\u{7}`;
const UP = '\u{1B}[A';
const KILL_LINE = '\u{15}';
const WAIT_MS = 8000;

type Shell = {
  output: () => string;
  write: (data: string) => void;
  waitFor: (text: string, from?: number) => Promise<number>;
  exited: Promise<void>;
};

function startShell(home: string, startup: string, userZdotdir?: string): Shell {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ZDOTDIR' && key !== 'HISTFILE') environment[key] = value;
  }
  const child = pty.spawn(ZSH, [], {
    name: 'xterm-256color',
    cols: 200,
    rows: 40,
    cwd: home,
    env: { ...environment, HOME: home, ...shellStartupEnvironment(startup, NONCE, userZdotdir) },
  });
  let output = '';
  child.onData((data) => { output += data; });
  const exited = new Promise<void>((resolve) => { child.onExit(() => { resolve(); }); });
  const waitFor = async (text: string, from = 0): Promise<number> => {
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      const index = output.indexOf(text, from);
      if (index !== -1) return index + text.length;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`zsh never printed ${JSON.stringify(text)}; output was ${JSON.stringify(output)}`);
  };
  return { output: () => output, write: (data) => { child.write(data); }, waitFor, exited };
}

describe.skipIf(!existsSync(ZSH))('zsh startup files', () => {
  let home: string;
  let startup: ZshStartupDirectory;

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'zsh-home-'));
    startup = new ZshStartupDirectory(home);
    writeFileSync(path.join(home, '.zsh_history'), 'echo seeded-entry\n');
  });

  afterEach(() => {
    startup.dispose();
    rmSync(home, { recursive: true, force: true });
  });

  it('installs the hooks after the user\'s .zshrc without putting anything in history', async () => {
    writeFileSync(path.join(home, '.zshrc'), [
      'HISTFILE=$HOME/.zsh_history',
      'HISTSIZE=100',
      'SAVEHIST=100',
      'setopt incappendhistory',
      "PROMPT='user> '",
      'USER_RC_RAN=yes',
      'print startup-banner',
      '',
    ].join('\n'));
    const shell = startShell(home, startup.path());

    const ready = await shell.waitFor(SETUP_MARKER, await shell.waitFor(PROMPT_MARKER));
    expect(shell.output().indexOf('startup-banner')).toBeLessThan(shell.output().indexOf(SETUP_MARKER));

    // Up at the very first prompt recalls the user's own last command, not a setup line.
    shell.write(UP);
    const recalled = await shell.waitFor('seeded-entry', ready);
    expect(shell.output().slice(ready, recalled)).not.toContain('_janus');
    shell.write(KILL_LINE);

    shell.write('echo "rc=$USER_RC_RAN zd=${+ZDOTDIR} setup=${+JANUS_SHELL_SETUP} prompt=$PROMPT"\r');
    await shell.waitFor('rc=yes zd=0 setup=0 prompt=%B>%b ', recalled);

    const listed = shell.output().length;
    shell.write('fc -l 1\r');
    const listing = await shell.waitFor(PROMPT_MARKER, listed);
    expect(shell.output().slice(listed, listing)).toContain('seeded-entry');
    expect(shell.output().slice(listed, listing)).not.toContain('_janus');
    expect(shell.output().split(SETUP_MARKER)).toHaveLength(2);

    shell.write('exit\r');
    await shell.exited;
    const history = readFileSync(path.join(home, '.zsh_history'), 'utf8');
    expect(history).toContain('echo "rc=');
    expect(history).not.toContain('_janus');
  }, 20_000);

  it('gives the user their own ZDOTDIR back and reads their startup files from it', async () => {
    const zdotdir = path.join(home, '.config', 'zsh');
    mkdirSync(zdotdir, { recursive: true });
    writeFileSync(path.join(zdotdir, '.zshenv'), 'USER_ENV_RAN=yes\n');
    writeFileSync(path.join(zdotdir, '.zshrc'), 'USER_RC_RAN=zdotdir\n');
    const shell = startShell(home, startup.path(), zdotdir);

    const ready = await shell.waitFor(PROMPT_MARKER);
    shell.write('echo "env=$USER_ENV_RAN rc=$USER_RC_RAN dir=$ZDOTDIR"\r');
    await shell.waitFor(`env=yes rc=zdotdir dir=${zdotdir}`, ready);
    shell.write('exit\r');
    await shell.exited;
  }, 20_000);

  it('never leaves the user\'s history file pointing into the startup directory', async () => {
    const shell = startShell(home, startup.path());
    const ready = await shell.waitFor(PROMPT_MARKER);
    shell.write('print -r -- "$HISTFILE"\r');
    const end = await shell.waitFor(PROMPT_MARKER, ready);
    expect(shell.output().slice(ready, end)).not.toContain(startup.path());
    shell.write('exit\r');
    await shell.exited;
  }, 20_000);
});
