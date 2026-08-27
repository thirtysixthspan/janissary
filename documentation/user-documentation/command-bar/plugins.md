# Bundled plugins

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

`plugins` lists the tab plugins that ship with the app and what each one is doing. Reading the list never starts anything, and the command takes no arguments — anything after it reports `Usage: plugins`.

```
plugins
```

```
audio 1.0.0 api=1 state=declared
image 1.0.0 api=1 state=active activation=6ms
markdown 1.0.0 api=1 state=declared
page 1.0.0 api=1 state=declared
schedules 1.0.0 api=1 state=declared
video 1.0.0 api=1 state=declared
```

Each line names the plugin, its own version, the plugin API version it was built against, and its state. There is nothing to install, enable, or configure. These six are part of the app, and no plugin comes from anywhere else.

## What a plugin gives you

<img class="agent-float left" src="/agents/yusuf-south-east.png" alt="" />

A plugin owns a kind of tab and the ways you reach it. The [image viewer](/user-documentation/tab-types/image-viewer), [markdown preview](/user-documentation/tab-types/markdown-preview), [embedded web pages](/user-documentation/tab-types/web-pages), [video player](/user-documentation/tab-types/video-player), [audio player](/user-documentation/tab-types/audio-player), and the [schedules](/user-documentation/automation/scheduling) list are all plugin tabs. You reach them the way you always have: `open` on a file the plugin claims, `open <url>`, or the plugin's own command such as `video` or `audio`. Nothing about typing a command changes because a plugin is behind it.

Plugin tabs are live views. They aren't restored by `janus --relaunch`, though `profile save` records most of them and reopens them by reissuing the same command you would type.

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

Every tab that plugin owned closes with it, and further attempts to use it repeat the same reason instead of trying again. Every other plugin, tab, and command keeps working. Restarting the app is the only way to give a disabled plugin another chance.

A plugin refusing one bad request is a different thing and is not fatal. It reports the problem, stays on, and answers the next request normally.
