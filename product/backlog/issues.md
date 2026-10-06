# issues

## ready

* in a shell tab, the padding and border of the terminal should respect the theme colors.

* in a shell tab, the shell's own command history should not include shell setup commands, for example:
export PROMPT='> '; autoload -Uz add-zsh-hook; _janus_preexec() { local line=$1; [[ -z $line ]] && line=$3; printf '\033]133;C;e4a68e586bf600af5eb1ff186981fcd4;%s\a' "$(print -rn -- "$line" | base64 | tr -d '\n')"; }; _janus_emit_cwd() { printf '\033]7;e4a68e586bf600af5eb1ff186981fcd4;%s\a' "$(print -rn -- "$PWD" | base64 | tr -d '\n')"; }; _janus_precmd() { printf '\033]133;D;e4a68e586bf600af5eb1ff186981fcd4\a'; _janus_emit_cwd; }; _janus_chpwd() { _janus_emit_cwd; }; add-zsh-hook preexec _janus_preexec; add-zsh-hook precmd _janus_precmd; add-zsh-hook chpwd _janus_chpwd; _janus_emit_cwd; printf '\033]133;E;e4a68e586bf600af5eb1ff186981fcd4\a'

## development

## deferred

## declined
