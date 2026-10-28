# Converted from multitasking.json.
# The harness cwd fields are dropped: a workspaced harness starts in its own clone either way.
# The navigator path is carried over as written from the JSON and is specific to one machine.
# The activity monitor is owned by the system tab, not the tab that ran the launch.
# Relaunching keeps open feature, plan, and refactor tabs instead of closing and reopening them.
harness claude as feature in group 1 --model claude-sonnet-5
tab color feature #5f27cd
edit $root/product/backlog/issues.md
tab group issues.md 1
tab color issues.md #01a3a4
harness claude as plan in group 1 --model claude-opus-5
tab color plan #6bcb77
edit $root/product/backlog/features.md
tab group features.md 1
tab color features.md #ffd93d
harness claude as refactor in group 1 --model claude-sonnet-5 --effort high
tab color refactor #a66cff
edit $root/product/backlog/technical-debt.md
tab group technical-debt.md 1
tab color technical-debt.md #ff6f91
files on left /Users/ashmorgan/dev/janissary
layout window 1280 800
unmonitor activity
monitor activity group:1
tab focus feature
