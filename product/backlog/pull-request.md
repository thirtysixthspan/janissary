<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* copying with the key binding from a shell tab should put the copied text in the paste buffer and be an entry in the clipboard.

* prevent shell initialization from entering the command history, for example:
export PROMPT='> '; autoload -Uz add-zsh-hook; _janus_preexec() { local line=$1; [[ -z $line ]] && line=$3; printf '\033]133;C;%s\a' "$(print -rn -- "$line" | base64 | tr -d '\n')"; }; _janus_emit_cwd() { printf '\033]7;file://%s%s\a' "$HOST" "$PWD"; }; _janus_precmd() { printf '\033]133;D\a'; _janus_emit_cwd; }; _janus_chpwd() { _janus_emit_cwd; }; add-zsh-hook preexec _janus_preexec; add-zsh-hook precmd _janus_precmd; add-zsh-hook chpwd _janus_chpwd; _janus_emit_cwd; printf '\033]133;E\a'

* multiple lines in the command bar should be sent as a single command in the shell, not multiple commands.

* the msg command to a shell tab, of each type, should be supported.

