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
// shell. The interactive startup file is the one that matters: zsh reads `.zshrc` and bash reads
// `.bashrc` only when the shell is interactive, and that is where a version manager's PATH setup
// (nvm, rbenv, pyenv, mise, asdf) lives. A program launched without `-i` therefore cannot find a
// binary the user finds by typing its name.
const INTERACTIVE_COMMAND_SHELLS = new Set(['bash', 'zsh']);

function shellName(shellPath: string): string {
  return shellPath.split('/').pop() ?? '';
}

// The flags that make `shellPath` skip its startup files. A shell we don't recognize gets none:
// reading its rc file is a far smaller problem than refusing to launch on an unknown flag.
export function shellStartupArgs(shellPath: string): string[] {
  return STARTUP_ARGS[shellName(shellPath)] ?? [];
}

// The argv that runs `command` through `shellPath` as an interactive shell — and deliberately not as
// a login one, which is what makes the program see the same PATH the user's own terminal has rather
// than a reshuffled version of it. On macOS every login shell sources `/etc/zprofile` (or
// `/etc/profile`), which runs `path_helper`; that does not extend PATH but rebuilds it, emitting the
// directories in `/etc/paths` and `/etc/paths.d` first and appending the caller's own entries after
// them. A binary the user's PATH resolves to one copy of then resolves to whichever older copy
// happens to sit in a promoted directory. Nothing is lost by skipping it: janissary is started from
// the user's terminal, so its inherited PATH is already a login shell's, complete and in the order
// the user established — login initialization can only reorder it. The remote launch line in
// `remote/entry-factory.ts` (`$SHELL -ic "janus remote-serve"`) has always used this form.
//
// The flags are passed separately rather than bundled as `-ic`, which keeps the form correct for a
// shell that parses them one at a time. A shell outside the known set gets `-c` alone, for the same
// reason `shellStartupArgs` gives an unrecognized shell nothing: exiting on an unaccepted flag would
// cost the launch entirely, which is worse than one startup file left unread.
export function shellCommandArgs(shellPath: string, command: string): string[] {
  if (!INTERACTIVE_COMMAND_SHELLS.has(shellName(shellPath))) return ['-c', command];
  return ['-i', '-c', command];
}
