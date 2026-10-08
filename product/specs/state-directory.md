### State directory

No tab's state is written under `.janissary/`: shell and harness tabs, like every other tab, are live and in-memory, and no launch recreates them (see `application-state.md`).

On a normal `janus` launch the per-run directories — harness capture, recording and transcript files, browser logs, git-failure output, and the workspace directory — are recursively deleted before rendering. On `janus --relaunch` they are preserved.

Concurrent `janus` processes are only safe when targeting distinct directories. A PID lock file at `.janissary/lock` prevents two processes from sharing one directory at the same time, so the second process cannot clear state out from under the first. The lock refuses a recorded pid only when this user can still signal it, so two instances running under different accounts in one shared directory are both admitted — and the remote-sessions record file (see `sessions-tab.md`) is therefore named per account, `remote-sessions.<account-hash>.json`, with each instance writing only its own and a load merging every account's file into one list. The pre-keying `remote-sessions.json` is read the same way, so a parked session survives the upgrade untouched.
