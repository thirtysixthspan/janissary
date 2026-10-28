# Converted from debugging.json.
# Not reproduced: the shell tab's dot color (#ffd93d), because a bare shell's label is not known in advance.
# Relaunching keeps an open debugging tab instead of closing and reopening it.
harness claude as debugging in group 1 --no-workspace --no-auto-approve --model claude-opus-5 --effort high
tab color debugging #f368e0
shell --no-workspace in group 1
files in debugging on left
notifications right
layout window 1280 800
layout sidebar left 248
layout sidebar right 300
layout reporting 20
tab focus debugging
