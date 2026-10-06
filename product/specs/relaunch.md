# Relaunch

(`janus --relaunch`)

1. Preserve the state directory instead of clearing it (see `state-directory.md`): harness capture, recording and transcript files, browser logs, git-failure output, and workspace clones are kept.
2. Append to `.janissary/log/server.log` rather than truncating it (see `cli.md`).
3. Open the launch shell, exactly as a normal launch does (see `tabs.md`). No agent tab is restored.
4. Attach every recorded remote session, opening its tabs as each peer answers (see `remote-server.md`). Each is attempted independently and none holds the rest up: a peer that refuses is marked terminated, and a host that cannot be reached leaves its session listed as detached with the failure on its row. An ordinary `janus` start does not do this — it lists those sessions as detached and waits for the button in the sessions tab.
