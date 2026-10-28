# Converted from planning.json.
# The harness cwd field is dropped: a workspaced harness starts in its own clone either way.
# The navigator line is carried over exactly. Its relative path resolves inside the planning clone,
# as it does in the JSON, so the tree waits on a directory that does not exist there.
# Relaunching keeps an open planning tab instead of closing and reopening it.
harness claude as planning in group 1 --model claude-sonnet-5 --effort high
tab color planning #f368e0
files in planning on left .janissary/workspace/planning
notifications right
layout window 1280 800
tab focus planning
