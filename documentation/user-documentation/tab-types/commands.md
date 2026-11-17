# Commands

See which application commands are available, and decide which ones agents may use.

```
commands
```

## The table

<img class="agent-float" src="/agents/fariz-south-west.png" alt="" />

A bar above the table has a Refresh icon, which re-reads the settings file, and the split-tab icon, as on the Models tab. At its left, a line names the file you are editing — `~/.janissary/commands.json`, or your project's own file when it has one. If no settings file can be read, it reads `No commands file in effect`, and a damaged file's problem appears beneath the bar. When your project's file is in effect and leaves enabled commands or agent access that your home file disabled, a note beneath the bar says how many home restrictions the project file lifts and names them, because a project file replaces your home file rather than adding to it.

Every row is an application command. **Enabled** controls whether the command can be dispatched at all. **Agent access** appears only for native ACP commands and controls whether agents may use them; commands without that column are never offered to agents. A row is labeled by its canonical name when that name is one of its forms, or when its first fixed form is another row's name; otherwise it shows its first fixed form, so the builtin `question` row reads `question` while the native `question ask` row reads `question ask`. The table keeps its columns and scrolls sideways when the tab is narrow, including when you dock it with `tab dock`.

The checkboxes show what is saved, not whether the command can run right now. A command under a disabled parent keeps its saved value, is dimmed, shows `Disabled by parent command: <parent>.`, and cannot be changed until the parent is enabled. A native command whose parent denies agent access keeps its saved Agent access value, shows the same note, and lets you change Enabled without letting you grant agent access. A command you disabled on its own keeps an Enabled checkbox you can turn back on, but its Agent access stays unavailable until it is enabled.

<img class="agent-float left" src="/agents/malik-south-east.png" alt="" />

You can disable one native command without affecting the others. The six `file` commands, `file read`, `file glob`, `file grep`, `file write`, `file edit`, and `file patch`, each have their own **Enabled** and **Agent access** boxes under the `file` parent. Turn off `file write` to refuse just the `file write` command, both typed in a command bar and used as an agent tool, while the other five keep working. Turn off `file` to refuse all six. These rows appear in the Commands table and in the Roles command picker like any other row.

`web` has its own row with no parent, and `web search` and `web fetch` are both native children with their own **Enabled** and **Agent access** boxes. Turn off `web` to refuse every typed `web` line, including both children. Turn off `web search` or `web fetch` alone to refuse only that command, typed or as an agent tool. A typed `web search` or `web fetch` uses the same row as a typed `file write`, so the two follow the same rules.

## Saving

Each click saves immediately. Every row that shares the same command setting is unavailable until the save finishes, and no other row is affected. The checkbox changes only after the save succeeds and the new settings reach the tab, so a failed save leaves the last successful value in place and shows the refusal above the table. The next click clears that refusal. Every open Commands tab updates after a successful save.

## Keyboard

`Space` toggles the focused checkbox. `Up` and `Down` move to the same checkbox in the previous or next row; when that checkbox is missing or unavailable, focus falls back to the row's Enabled checkbox, and rows where both are unavailable are skipped. Focus stops at the first and last rows. `Escape` and every other key keep their usual meaning.

## Change one setting from the command bar

`commands enable [agent|global] <command>` and `commands disable [agent|global] <command>` change one setting without opening the tab. Leave out the selector to change whether the command is enabled; use `agent` to change agent access. Names match canonical names, aliases, and fixed forms exactly, ignoring case and repeated spaces.

```
commands disable global quit
commands disable agent browser goto
```

A malformed form prints `Usage: commands [enable|disable [agent|global] <command>].`, an unknown name prints `Unknown application command: <command>.`, and agent access on a non-native command prints `Not a native ACP command: <canonical>.`

## The file

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

`commands.json` is a plain JSON object keyed by command name. Each value may hold boolean `enabled` and `agentAccess` fields; a missing field means `true`. A project's `.janissary/commands.json` replaces your home file when it is valid. Unknown names do not affect settings and are removed the next time the file is saved. See the [application commands](/user-documentation/command-bar/commands) page for the full settings behavior.

A file you can't use is never overwritten. If your project's `commands.json` is damaged, the tab falls back to your home file and shows `commands.json <problem> at <path> — showing the home commands file.` beneath the bar. With no usable file, it shows `commands.json <problem> at <path> — showing default commands.`, where the problem is why the file was rejected, such as invalid JSON. That fallback stays after a successful edit while the damaged file is still there.

You can't change a setting while no usable file is available. The tab refuses the edit with `commands.json at <path> is unusable — fix the file before editing commands.` A save that fails shows `Could not write commands.json at <path>.` and keeps the value you saw before the click.

`commands` itself is an ordinary setting. It can disable itself, and you can turn it back on from its open tab. Once the tab is closed, a disabled `commands` is refused like any other command, so edit the effective `commands.json` by hand to restore it.
