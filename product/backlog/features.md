# features

## ready

* Move janissary's ACP tool loop — the primer, last-line command extraction, and AcpTool dispatch currently run in runCorePrompt on the local host even when the tab's ACP client is hosted on a remote machine — to the far side, so that command execution (and not merely the ACP subprocess) happens where the workspace actually lives. Today a remote ACP tab runs the agent on the remote host but parses its replies, matches commands against the tool table, and dispatches browser, db, and any future file read locally, which means every result must either be reconstructed remotely or silently reads/acts on the wrong machine; this item would move Layer 2 into the far-side ACP service so the remote server owns the primer it injects, the command it extracts from each reply, the tool it runs, and the output it feeds back, returning to the local side only streamed text, final answers, and tool activity for display. The change needs acp-open to carry the role's command grants and command-settings snapshot (or a way for the far side to resolve its own equivalent), a far-side tool table bound to that host's managers and workspace so file read and other host-side tools resolve remote paths under remote containment, and a protocol bump because a peer that ignores the new fields would look healthy while executing the wrong tool set; question is the deliberate exception — the human is local, so question registration and approval must remain on the local side and round-trip through a frame rather than being answered remotely. Benefits are correctness for all host-side tools on remote tabs, one code path for local and remote command loops, no full-file base64 round trips for reads, and the ability to reuse the remote filesystem and database managers the plugin capabilities already expose; risks are protocol-version churn, keeping role grants and native-command settings synchronized between both hosts, and preserving the existing cancellation, retry, record, and activity semantics that currently assume a local loop.

* Add a file read native ACP tool so janissary, rather than the harness, can serve file contents to agents. Agents end a reply with agent read <path> [--offset <line>] [--limit <lines>]; janissary parses the command, resolves and bounds-checks the path against the tab's workspace, reads the requested line range as UTF-8 text, and returns numbered lines (with a truncation notice when capped), or a single-line error for missing, binary, oversized, or out-of-workspace files. The tool is granted per role like browser, question, and db, appears in the ACP primer only when granted, and uses the existing AcpTool table, native-command vocabulary, and command settings, giving every harness identical read semantics, workspace-boundary enforcement, secret-file policy, and auditability instead of relying on each harness's built-in read. Read should be strictly limited to files in the workspace.

## development

* add an ACP skill to allow an agent to spin up other agents with different models, pass them ai tasks (form the repository) to execute and access to monitor the transcript as the agent works, and to recieve the response.



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

