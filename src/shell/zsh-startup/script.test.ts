import { describe, expect, it } from 'vitest';
import {
  ZSHENV, ZSHRC, createShellMarkerNonce, shellSetupScript, shellStartupEnvironment,
} from './script.js';

const NONCE = 'ab'.repeat(16);

describe('createShellMarkerNonce', () => {
  it('mints 32 lowercase hex characters, fresh each time', () => {
    const first = createShellMarkerNonce();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(createShellMarkerNonce()).not.toBe(first);
  });
});

describe('shellSetupScript', () => {
  it('defines one install function that signs every marker with the nonce', () => {
    const script = shellSetupScript(NONCE);
    expect(script.startsWith('_janus_install() {')).toBe(true);
    expect(script).toContain(String.raw`printf '\033]133;C;${NONCE};%s\a'`);
    expect(script).toContain(String.raw`printf '\033]133;D;${NONCE}\a'`);
    expect(script).toContain(String.raw`printf '\033]7;${NONCE};%s\a'`);
    expect(script).toContain("export PROMPT='%B>%b '");
    expect(script).toContain('add-zsh-hook preexec _janus_preexec');
  });

  it('reports the directory as the base64 of $PWD rather than a file URL', () => {
    const script = shellSetupScript(NONCE);
    expect(script).toContain(String.raw`_janus_emit_cwd() { printf '\033]7;${NONCE};%s\a' "$(print -rn -- "$PWD" | base64 | tr -d '\n')"; }`);
    expect(script).not.toContain('file://');
  });

  it('bolds the line typed or pasted at the prompt, keeping the other highlight defaults', () => {
    expect(shellSetupScript(NONCE))
      .toContain('typeset -g zle_highlight=(region:standout special:standout suffix:bold isearch:underline paste:bold default:bold)');
  });

  it('writes the nonce only into the markers, never into a shell variable', () => {
    expect(shellSetupScript(NONCE).split(NONCE)).toHaveLength(5);
  });

  it('marks setup complete once, at the first prompt, after zsh has read its history', () => {
    const script = shellSetupScript(NONCE);
    expect(script).toContain('_janus_emit_cwd; _janus_first_prompt; }');
    expect(script).toContain(String.raw`_janus_first_prompt() { printf '\033]133;E;${NONCE}\a'; _janus_first_prompt() { :; }; }`);
  });

  it('refuses anything but a minted nonce, since it is written into code zsh runs', () => {
    expect(() => shellSetupScript("'; rm -rf ~; '")).toThrow();
  });
});

describe('shellStartupEnvironment', () => {
  it('points zsh at the startup directory and carries the setup', () => {
    expect(shellStartupEnvironment('/tmp/janus-zsh-x', NONCE, undefined)).toEqual({
      ZDOTDIR: '/tmp/janus-zsh-x',
      JANUS_SHELL_SETUP: shellSetupScript(NONCE),
    });
  });

  it('passes the user\'s own ZDOTDIR on so the startup files can restore it', () => {
    expect(shellStartupEnvironment('/tmp/janus-zsh-x', NONCE, '/home/u/.config/zsh').JANUS_USER_ZDOTDIR)
      .toBe('/home/u/.config/zsh');
  });
});

describe('startup files', () => {
  it('clear the setup from the environment before any user file runs', () => {
    const lines = ZSHENV.split('\n');
    expect(lines.indexOf('unset JANUS_SHELL_SETUP')).toBeLessThan(lines.findIndex((line) => line.includes('.zshenv')));
  });

  it('install the hooks after the user\'s .zshrc', () => {
    const lines = ZSHRC.split('\n');
    expect(lines.findIndex((line) => line.includes('_janus_install;')))
      .toBeGreaterThan(lines.findIndex((line) => line.includes('/.zshrc')));
  });
});
