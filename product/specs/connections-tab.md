# Connections tab and connection tabs

The connections tab is the app-wide list of connections. A connection tab shows one tracked ACP session or one agent run. The pair follows the conversations list and conversation tabs: a singleton list tab plus one tab per record, fed by the connections topic. See [[connection]] and [[acp-records]].

### The connections tab

The connections tab is titled `Connections`. Bare `connections` opens or focuses it, `connections left` and `connections right` dock it, and bare `connections` returns a docked list to the centre. It lists every connection kind — sqlite, shell, acp, browser, ssh, and terminal — plus every retained ACP and agent record across every tab, ordered by most recent activity.

Non-ACP connections appear only while live and leave the list when they close. ACP sessions stay listed after they close. Each row shows the connection's title, kind, owning tab, and status. An ACP session reads `Running` while a prompt runs, `Idle` between prompts, and `Closed` once it ends. An agent run reads `Running` until it finishes, then `Completed`, `Failed`, or `Terminated`. A non-ACP row reads `Open`.

Keyboard movement uses Up, Down, Home, End, and Enter. A row opens on a second click on the same row, matching the conversations list. Opening a non-ACP row focuses the tab that owns the connection. Opening an ACP row opens or focuses its connection tab. A non-ACP row's close control acts exactly like `connections close <kind>:<id>` and reports the same notification. An open ACP row's control closes its session; a closed ACP row's control deletes it after `Delete "<title>"?`. An empty list reads `No connections yet`.

Closed ACP records are kept per project and removed automatically 30 days after they close. An open record cannot be deleted.

### The connection tab

An ACP session's connection tab and row are titled `ACP: <first line of its first prompt>`, capped at 60 characters. An agent run is titled `Agent: <task filename>`. The tab opens with its metadata row and its prompt blocks. The metadata shows the title, model, owning tab, status, started and ended times, and the controls available for its status.

A core ACP connection tab offers **Cancel** and **Close session**. Cancel stops the running prompt and leaves the session open and `Idle`; Close session ends the connection as `acp reset` does. An agent run's tab offers **Terminate** instead, acting exactly like the agent monitor's Terminate and disabling once cleanup begins. A closed session's connection tab is read-only and has no prompt input. A closed record's row can be deleted from the list.

Each prompt block holds the prompt, then its activity entries in order, each labelled `message`, `thought`, `tool`, `plan`, or `permission`, then the rendered final answer. Thought and tool entries start collapsed. An active connection tab follows new output at the bottom while the reader remains there; scrolling away pauses following until the reader returns. The tab starts with the newest 20 blocks. Reaching the top loads 20 older blocks and preserves the viewport.

### Opening a connection tab from the popup

The connections popup in shell, editor, and harness tabs opens record tabs. A row carrying a durable record id opens or focuses that record's connection tab. A row carrying the popup-owning tab's own live ACP reference resolves to that tab's current record and opens or focuses its connection tab. Rows are operable by pointer and by Enter or Space.

A running agent run started from the caller appears in the caller's popup as an ACP-kind row titled `Agent: <task filename>`. It carries the run's durable record id and no ACP reference, so it opens the run's record tab and has no transcript snapshot button. It leaves the popup when the run ends.

A row that already offers a transcript snapshot keeps that separate button. Pressing the snapshot button opens the point-in-time transcript and never opens the record tab. Monitor and editor-persona rows stay snapshot-only and do not open a record tab. Surfaces that render no snapshot button today gain none.

The popup never opens a record tab by a second path. Opening a row dispatches the same connection record opener the rest of the app uses, so the connections plugin remains the sole owner of record tabs. A target whose tab or live record binding has disappeared does nothing. A durable record id still opens after its session, run, or caller has ended; only a missing or expired record is refused.
