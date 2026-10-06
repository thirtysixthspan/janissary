import { randomBytes } from 'node:crypto';
import { isShellMarkerNonce } from './shared.js';

// How the shell tab's status hooks reach zsh without a line typed at its prompt. zsh decides whether a
// line enters its history before the line runs, so nothing inside a typed setup line can keep that same
// line out: it would land in `fc -l`, under `Up`, and — with `INC_APPEND_HISTORY` — in `$HISTFILE` the
// moment it was entered. Instead the tab's zsh is spawned with `ZDOTDIR` pointing at the two startup
// files below, which run the user's own startup files and install the hooks after them.

// A program's output reaches the same terminal parser as the hooks' own markers, so a `cat` of a crafted
// file or a remote host over `ssh` could otherwise print a marker the tab would act on. Every marker the
// hooks emit carries this nonce, written literally into the hook functions rather than into a shell
// variable, so no child process can read it from its environment.
export function createShellMarkerNonce(): string {
  return randomBytes(16).toString('hex');
}

// `%B…%b` bolds the prompt character, and `default:bold` bolds the text in zsh's line editor, which
// stays bold in the scrollback once the line runs. The other contexts keep zsh's own defaults, since
// assigning the array replaces all of them; a pasted line — which is how the command bar sends one —
// is bold like a typed one rather than drawn in reverse video. `-g` because this runs inside
// `_janus_install`, and the array belongs to the shell rather than to that function.
export const ZSH_PROMPT_SETUP = "export PROMPT='%B>%b '; typeset -g zle_highlight=(region:standout special:standout suffix:bold isearch:underline paste:bold default:bold)";

// The setup the startup files evaluate: one function that, when called, sets the prompt and installs
// the hooks. Defining the hooks inside it means nothing runs until the user's `.zshrc` has, so the
// tab's prompt is still the one that wins. The setup-complete marker goes out once, just before the
// first prompt rather than at the end of `.zshrc`: zsh reads its history file after every startup
// file has run, and a warning from that read (a sandbox denies locking `~/.zsh_history`) belongs to
// the startup screen the tab clears on that marker.
export function shellSetupScript(nonce: string): string {
  if (!isShellMarkerNonce(nonce)) throw new Error('a shell marker nonce is 32 lowercase hex characters');
  return String.raw`_janus_install() {
  ${ZSH_PROMPT_SETUP}
  autoload -Uz add-zsh-hook
  _janus_preexec() { local line=$1; [[ -z $line ]] && line=$3; printf '\033]133;C;${nonce};%s\a' "$(print -rn -- "$line" | base64 | tr -d '\n')"; }
  _janus_emit_cwd() { printf '\033]7;${nonce};%s\a' "$(print -rn -- "$PWD" | base64 | tr -d '\n')"; }
  _janus_precmd() { printf '\033]133;D;${nonce}\a'; _janus_emit_cwd; _janus_first_prompt; }
  _janus_first_prompt() { printf '\033]133;E;${nonce}\a'; _janus_first_prompt() { :; }; }
  _janus_chpwd() { _janus_emit_cwd; }
  add-zsh-hook preexec _janus_preexec
  add-zsh-hook precmd _janus_precmd
  add-zsh-hook chpwd _janus_chpwd
}
`;
}

const HEADER = '# Written by Janissary for its shell tabs, and removed when it exits.';
const INSTALL = 'if (( ${+functions[_janus_install]} )); then _janus_install; unfunction _janus_install; fi';

// Read first. The setup leaves the environment before any of the user's code runs, so no child of the
// shell inherits the nonce. The user's own `ZDOTDIR` is put back while their `.zshenv` runs, and the
// one their `.zshenv` leaves behind is remembered for `.zshrc`; `ZDOTDIR` then points here again so
// zsh reads the `.zshrc` beside this file next. A `.zshenv` that turns `RCS` off stops every later
// startup file, so the hooks are installed here instead.
export const ZSHENV = [
  HEADER,
  'eval "$JANUS_SHELL_SETUP"',
  'unset JANUS_SHELL_SETUP',
  'typeset -g _janus_startup=$ZDOTDIR',
  'if (( ${+JANUS_USER_ZDOTDIR} )); then export ZDOTDIR=$JANUS_USER_ZDOTDIR; else unset ZDOTDIR; fi',
  'unset JANUS_USER_ZDOTDIR',
  '[[ -r ${ZDOTDIR:-$HOME}/.zshenv ]] && builtin source ${ZDOTDIR:-$HOME}/.zshenv',
  'if [[ -o rcs ]]; then',
  '  typeset -g _janus_user_zdotdir=${ZDOTDIR-} _janus_user_zdotdir_set=${+ZDOTDIR}',
  '  export ZDOTDIR=$_janus_startup',
  'else',
  `  ${INSTALL}`,
  '  unset _janus_startup',
  'fi',
  '',
].join('\n');

// Read second, after the system's own zshrc. That file may have set `HISTFILE` from `ZDOTDIR` while it
// pointed here (macOS's does), which would send the user's history into this directory; it is moved
// back to where the same line would have put it. Then the user's `.zshrc` runs, and the hooks after it.
export const ZSHRC = [
  HEADER,
  'if (( _janus_user_zdotdir_set )); then export ZDOTDIR=$_janus_user_zdotdir; else unset ZDOTDIR; fi',
  '[[ $HISTFILE == $_janus_startup/.zsh_history ]] && HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history',
  'unset _janus_startup _janus_user_zdotdir _janus_user_zdotdir_set',
  '[[ -r ${ZDOTDIR:-$HOME}/.zshrc ]] && builtin source ${ZDOTDIR:-$HOME}/.zshrc',
  INSTALL,
  '',
].join('\n');

// What the tab's zsh is spawned with: the startup directory, the setup, and the `ZDOTDIR` the user
// had, when they had one, so the startup files can give it back.
export function shellStartupEnvironment(
  directory: string, nonce: string, userZdotdir: string | undefined,
): Record<string, string> {
  return {
    ZDOTDIR: directory,
    JANUS_SHELL_SETUP: shellSetupScript(nonce),
    ...(userZdotdir !== undefined && { JANUS_USER_ZDOTDIR: userZdotdir }),
  };
}
