### harness

Open an AI coding harness in a tab, normally with a disposable workspace and browser. Flags opt out of workspace, browser, automatic approval, or automatic resume behavior.

**Usage**

`harness [name] [options] [on <address>] [in group <name|id>]`

`harness --no-workspace`

`harness --no-browser`

`harness --no-auto-approve`

`harness --no-auto-resume`

`harness capture <name>`

**Use cases**

- Start an AI coding session in its own tab and workspace.
- Capture a named screen or opt out of optional launch behavior.

**Examples**

- `harness` opens a harness with the default launch settings.
- `harness --no-workspace` opens a harness without a disposable workspace.
