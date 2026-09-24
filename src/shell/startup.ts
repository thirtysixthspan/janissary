// The per-shell argv tables: which flags each shell flavor actually accepts, both for suppressing a
// shell's startup files and for running one command through it.
//
// Tab shells are started with their startup files suppressed, so a user's interactive rc file can't
// print banners or set traps into the piped session. Each shell spells that differently: bash takes
// `--norc --noprofile`, while zsh rejects both (`zsh: no such option: norc`) and calls the same thing
// `--no-rcs`.
const STARTUP_ARGS: Record<string, string[]> = {
  bash: ['--norc', '--noprofile'],
  zsh: ['--no-rcs'],
};

// The shells known to accept `-i` alongside `-c`, so a command can be run through an interactive
// shell rather than a login-only one. The distinction decides which startup files are read: zsh
// reads `.zprofile` for a login shell but `.zshrc` only for an interactive one, and a version
// manager's PATH setup (nvm, rbenv, pyenv, mise, asdf) lives in the rc file. A program launched
// with `-lc` alone therefore cannot find a binary the user finds by typing its name.
const INTERACTIVE_COMMAND_SHELLS = new Set(['bash', 'zsh']);

function shellName(shellPath: string): string {
  return shellPath.split('/').pop() ?? '';
}

// The flags that make `shellPath` skip its startup files. A shell we don't recognize gets none:
// reading its rc file is a far smaller problem than refusing to launch on an unknown flag.
export function shellStartupArgs(shellPath: string): string[] {
  return STARTUP_ARGS[shellName(shellPath)] ?? [];
}

// The argv that runs `command` through `shellPath` as both a login and an interactive shell, so the
// program it launches sees the PATH the user's own terminal has. The flags are passed separately
// rather than bundled as `-lic`, which keeps the form correct for a shell that parses them one at a
// time. A shell outside the known set keeps the login-only `-lc`, for the same reason
// `shellStartupArgs` gives an unrecognized shell nothing: exiting on an unaccepted flag would cost
// the launch entirely, which is worse than one startup file left unread.
export function shellCommandArgs(shellPath: string, command: string): string[] {
  if (!INTERACTIVE_COMMAND_SHELLS.has(shellName(shellPath))) return ['-lc', command];
  return ['-l', '-i', '-c', command];
}
