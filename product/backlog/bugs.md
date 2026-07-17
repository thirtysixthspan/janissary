# bugs

## ready

* claude fails to reauthenticate in a harness with the following error: Please run /login · API Error: 401 Invalid authentication credentials after an extended run in a workspaced harness.

* acp doesnt detect rate limited queries and fails silently

* using --effort when launching a harness fails for opencode and codex likely because they use the terms variant and reasining level. 

* stderr | web/src/editor/useEditor.test.ts > useEditor > apply with vertical move falls back to moveCursor when resolveVertical returns null - The current testing environment is not configured to support act(...)

* claude reports issues when running ai tasks - every command emits /bin/bash: /tmp/claude-*-cwd: Operation not permitted and exit code 1 (harness Bash wrapper writes cwd to sandbox-denied /tmp). All tests/outputs are still valid — just the exit code is unreliable. Fix: set CLAUDE_CODE_TMPDIR to sandbox-allowed temp dir at launch.

## development

## deferred
