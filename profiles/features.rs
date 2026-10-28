# Converted from features.json.
# The editor joins a group named "features" rather than the profile's next free "group-<id>".
# The assistant monitor is owned by the system tab, not the tab that ran the launch.
# Relaunching keeps open features and planning tabs instead of closing and reopening them.
harness claude as features in group 1 --model claude-sonnet-5 --effort medium
harness claude as planning in group 1 --model claude-opus-5 --effort medium
files on left $root
edit $root/product/backlog/features.md
tab group features.md features
notifications right
layout window 1600 800
layout sidebar left 270
layout sidebar right 330
unmonitor assistant
monitor assistant group:1
tab focus features
