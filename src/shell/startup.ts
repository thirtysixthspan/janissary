// Tab shells are started with their startup files suppressed, so a user's interactive rc file can't
// print banners or set traps into the piped session. Each shell spells that differently: bash takes
// `--norc --noprofile`, while zsh rejects both (`zsh: no such option: norc`) and calls the same thing
// `--no-rcs`.
const STARTUP_ARGS: Record<string, string[]> = {
  bash: ['--norc', '--noprofile'],
  zsh: ['--no-rcs'],
};

// The flags that make `shellPath` skip its startup files. A shell we don't recognize gets none:
// reading its rc file is a far smaller problem than refusing to launch on an unknown flag.
export function shellStartupArgs(shellPath: string): string[] {
  const name = shellPath.split('/').pop() ?? '';
  return STARTUP_ARGS[name] ?? [];
}
