// A program's output reaches the same terminal parser as the hooks' own markers, so a `cat` of a crafted
// file or a remote host over `ssh` could otherwise print a marker the tab would act on. Every marker the
// hooks emit carries this nonce, written literally into the hook functions rather than into a shell
// variable so no child process can read it from its environment.
export function createShellMarkerNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function shellStatusHooks(nonce: string): string {
  return String.raw`export PROMPT='> '; autoload -Uz add-zsh-hook; _janus_preexec() { local line=$1; [[ -z $line ]] && line=$3; printf '\033]133;C;${nonce};%s\a' "$(print -rn -- "$line" | base64 | tr -d '\n')"; }; _janus_emit_cwd() { printf '\033]7;${nonce};%s\a' "$(print -rn -- "$PWD" | base64 | tr -d '\n')"; }; _janus_precmd() { printf '\033]133;D;${nonce}\a'; _janus_emit_cwd; }; _janus_chpwd() { _janus_emit_cwd; }; add-zsh-hook preexec _janus_preexec; add-zsh-hook precmd _janus_precmd; add-zsh-hook chpwd _janus_chpwd; _janus_emit_cwd; printf '\033]133;E;${nonce}\a'
`;
}
