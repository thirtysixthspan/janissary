# Bundled plugins

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

`plugins` prints one status line for each bundled tab plugin in the current transcript. It never opens a list tab or activates a plugin. It takes no arguments; anything after it reports `Usage: plugins`.

```
plugins
```

```
agent-monitor 1.0.0 api=2 state=declared
asciicast 1.0.0 api=2 state=declared
audio 1.0.0 api=2 state=declared
conversations 2.0.0 api=2 state=declared
diff 1.0.0 api=2 state=declared
image 1.0.0 api=2 state=declared
launcher 1.0.0 api=2 state=declared
markdown 1.0.0 api=2 state=declared
page 1.0.0 api=2 state=declared
pdf 1.0.0 api=2 state=declared
roles 1.0.0 api=2 state=declared
schedules 1.0.0 api=2 state=declared
scripts 1.0.0 api=2 state=declared
search 1.0.0 api=2 state=declared
sessions 1.0.0 api=2 state=declared
shell 1.0.0 api=2 state=declared
sql 1.0.0 api=2 state=declared
video 1.0.0 api=2 state=declared
```

Each line names the plugin, its own version, the API version it requires, and its state. Active plugins also show their activation time; disabled plugins show the recorded reason. A plugin's own version moves independently of the app's, which is why `conversations` is on a later version than the rest. There is nothing to install, enable, or configure. These plugins are part of the app, and no plugin comes from anywhere else.

## What a plugin gives you

<img class="agent-float left" src="/agents/yusuf-south-east.png" alt="" />

A plugin owns a kind of tab and the ways you reach it. The [agent monitor](/user-documentation/advanced-agents/agent-command) opens when you add `in a tab` to an `agent` command. The bundled views also include the [image viewer](/user-documentation/tab-types/image-viewer), [markdown preview](/user-documentation/tab-types/markdown-preview), [PDF viewer](/user-documentation/tab-types/pdf-viewer), [embedded web pages](/user-documentation/tab-types/web-pages), [video player](/user-documentation/tab-types/video-player), [audio player](/user-documentation/tab-types/audio-player), [recording player](/user-documentation/tab-types/recording-player), [diff view](/user-documentation/tab-types/diff-tab), [launcher](/user-documentation/tab-types/launcher), [roles](/user-documentation/tab-types/roles), and [shell](/user-documentation/command-bar/shell) tabs. The [schedules](/user-documentation/automation/scheduling) and [scripts](/user-documentation/tab-types/scripts) lists, [conversation list](/user-documentation/tab-types/conversations), [sessions](/user-documentation/tab-types/sessions) list, [project search](/user-documentation/command-bar/project-search) tab, and [SQL database browser](/user-documentation/tab-types/sql-browser) are plugin tabs too. You reach file and page views with `open`, or open a plugin's own view with its command, such as `shell`, `diff`, `launcher`, `roles`, `video`, `audio`, `pdf`, `schedules`, `scripts`, `conversations`, `sessions`, `search`, or `sql`. The search tab also has a shortcut, `Cmd+Shift+F`, which runs the same `search` command you would type. Nothing about typing a command changes because a plugin is behind it.

Plugin tabs are live views. They aren't restored, except for remote shell tabs, which return on their existing remote PTYs. A [profile](/user-documentation/automation/profiles) can reopen most plugin tabs by reissuing the same command you would type.

## What the states mean

| State | Meaning |
|---|---|
| `declared` | Known about, never started. Nothing of it has been loaded. |
| `active` | Started, because you used one of its routes. `activation=<n>ms` reports how long that took. |
| `disabled` | It broke, or its claim on a file type or command was refused. `reason=` says why. |

A plugin starts the first time you use it and not before, so a plugin you never reach costs nothing. States last as long as the app is running; restart and everything goes back to `declared`.

## When a plugin breaks

<img class="agent-float" src="/agents/tahir-south-east.png" alt="" />

A plugin that fails is switched off on its own rather than taking anything else down with it. You'll see one line in the tab you were working in, and in the [notifications](/user-documentation/tab-types/notifications) feed if it's open:

```
Tab plugin "video" disabled: <reason>.
```

Every tab that plugin owned closes with it, and further attempts to use it repeat the same reason instead of trying again. If those tabs were the only central tabs, the notifications feed opens as a core recovery surface. Every other plugin, tab, and command keeps working. Restarting the app is the only way to give a disabled plugin another chance.

A plugin refusing one bad request is a different thing and is not fatal. It reports the problem, stays on, and answers the next request normally.
