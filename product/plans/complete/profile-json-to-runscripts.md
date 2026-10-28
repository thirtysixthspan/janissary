# Runscripts for the built-in profiles

**Complexity: 2/10** — six new data files in `profiles/`, no source change. The work is in mapping each JSON field to the command that reproduces it, and in being honest about the fields no command can reproduce.

## Goal

Add `profiles/<name>.rs` beside each built-in `profiles/<name>.json`: `debugging`, `default`, `features`, `multitasking`, `planning`, and `product-review`. Since `profile launch` prefers a runscript over a JSON file in the same directory (see `product/plans/complete/profile-runscript-launch.md`), launching any built-in profile runs its runscript from now on. The JSON files stay. A project file of the same name still overrides either.

Per the request, no tests and no documentation or spec updates are part of this change.

## How a runscript line runs

The facts the conversion depends on, traced through the code:

- Lines are queued to the hidden `system` shell and run one at a time through ordinary command-bar routing, with `system` as the issuing tab. Each application command is awaited (up to 30 seconds) before the next line runs, so a `tab color` line finds the harness opened on the line before it. Draining needs a connected window.
- `system` and the root `janus` tab are both in group 1, named `launch`. Every profile here authors `"group": 1` for its strip tabs, so the runscripts join group 1 explicitly.
- `harness`, `edit`, `files`, and `notifications` take their group from the **focused** tab, not from `system`. `harness` also takes its refusal attribution from it, and with `--no-workspace` its starting directory too. `shell` and `sessions` take `system`'s group. So every strip tab gets an explicit `in group 1` (harness, shell) or `tab group <tab> 1` (editor).
- A new tab is appended to the end of its group and becomes active. Opening the strip tabs in `number` order therefore reproduces the profile's relative order.
- `tab focus <tab>` undocks a docked tab, so it is used only on strip tabs, and only as the last line, after every dock has moved focus.
- An editor tab's label is `editor`, `editor-2`, …, but its title is the file's basename, and `tab` commands match titles. Editors are therefore targeted by basename.
- `files` and `edit` expand `$root` and `~` themselves. `files … $root/` with `expand`/`cursor`/`anchor`/`select` clauses is the same form `files print` emits.

## Field mapping

| JSON | Runscript |
| --- | --- |
| harness `name`, `tool` | `harness <tool> as <name> in group 1` |
| `model`, `effort` | `--model <model>`, `--effort <effort>` |
| `workspace: false`, `autoApprove: false`, `browser: false`, `offline: true` | `--no-workspace`, `--no-auto-approve`, `--no-browser`, `--offline` (defaults emit nothing) |
| `color` on a named tab | `tab color <tab> <color>` |
| `group: 1` | `in group 1` on `harness`/`shell`, `tab group <tab> 1` on an editor |
| editor `path` | `edit <path>` |
| authored `pane` | `tab pane <tab> <side>` |
| `files` with `dock` and view keys | `files on <side> [expand …] [cursor …] [anchor …] [select …] <path>` |
| `files` with no path or a relative path | `files in <first new tab> on <side> [path]`, the tab a profile resolves it against |
| `notifications` with `dock` (and `focus`) | `notifications <side>`, which also selects the feed in that sidebar |
| `plugin` `sessions` with `dock` | `sessions <side>` |
| `plugin` `shell` | `shell --no-workspace in group 1` |
| `monitors` | `unmonitor <name>` then `monitor <persona> <targets…>` (the profile also stops a same-named monitor first) |
| `layout` | `layout window`, `layout sidebar left`/`right`, and `layout reporting <100 − tabAreaPct>`, only for the keys the profile sets (the client patches only the sizes it is sent) |
| no `focus` anywhere | a final `tab focus <first new strip tab>` when the profile opens a harness |

Lines run in the profile's own order: harnesses, then navigators, then editors, then plugin tabs, then notifications, layout, monitors, and the final focus. Where harnesses and editors share a group, they are interleaved in `number` order, because the profile reorders them by `number` after opening them, and the docked navigator follows them.

Each runscript starts with a `#` comment naming its source and listing what it does not reproduce. Those comments ship with the file, so a reader of an installed copy sees the gaps without this plan.

## What no runscript can reproduce

These apply to every converted profile:

1. **Relaunch does not reset.** A profile closes every tab matching an entry before reopening it. The runscripts emit no `close` lines. `close` cannot tell "this profile's tab" from the tab the launch was typed in, which the profile always spares, and closing the last strip tab opens the quit dialog. So relaunching leaves an open harness running, and `harness` reports `Cannot launch "<name>": a tab named "<name>" is already open.` to the notifications feed. Editors, navigators, and docked feeds are reused, as they are by a profile.
2. **Monitors are owned by `system`**, not by the tab `profile launch` was typed in. They keep running when that tab closes, their replies land in the hidden system shell, and `unmonitor` must be issued from there.
3. **No launch report.** Nothing is printed when the runscript starts. Per-line errors land in the hidden system shell's transcript, or in notifications for `tab` and launch refusals.
4. **Placement relative to the group's existing tabs.** A profile moves its numbered tabs ahead of the group's other tabs, `janus` included. The runscripts append them after. Their order among themselves is kept.
5. **Exact colors.** A profile picks a different dot color when the authored one is already in use. `tab color` applies it as written.
6. **`groupColor`.** No command sets a group's band color. In both forms, though, group 1 already exists (it holds `janus` and `system`), and a profile joining an existing group keeps that group's color, so the authored `groupColor` changes nothing today either.
7. **Unauthored `pane`.** A profile puts a tab with no `pane` in the left pane. A runscript tab opens in the focused pane. `tab pane` lines are emitted only where the JSON authors a `pane`.
8. **Focus timing.** Lines run after `profile launch` returns, so switching tabs before the queue drains changes which tab a `harness` line treats as focused.

Per profile:

- **`debugging`.** The shell tab's dot color (`#ffd93d`) is not applied, because a bare `shell` takes a pool name that is not known ahead of time. Naming it would change its label and make relaunch refuse it. `--no-workspace` harnesses start in the focused tab's directory, which is the tab the launch was typed in, as in the profile, unless focus moves first (item 8).
- **`default`.** Nothing beyond the shared items.
- **`features`.** The editor authors no group, so the profile puts it in a fresh default group named `group-<id>`. A runscript cannot know the next free ID, so it uses `tab group features.md features`, which creates a group by name with the next free ID. The group is named `features`, not `group-<id>`, and a relaunch reuses it instead of starting another.
- **`multitasking`.** The harness `cwd` fields are dropped. A workspaced harness starts in its own clone and the profile ignores `cwd` for it, so nothing changes. The navigator path `/Users/ashmorgan/dev/janissary` is carried over as written; it is a machine-specific path that does not exist on most machines, in the JSON as much as here.
- **`planning`.** The harness `cwd` is dropped for the same reason. The navigator line is carried over exactly (`files in planning on left .janissary/workspace/planning`), which reproduces a fault in the JSON: the relative path resolves against the planning harness's own clone, so the tree waits on `.janissary/workspace/planning/.janissary/workspace/planning`, which never appears. `files on left $root/.janissary/workspace/planning` would show the clone, but that would change behavior, so it is reported instead.
- **`product-review`.** Nothing beyond the shared items.

## Implementation steps

1. Write the six runscripts in `profiles/`.
2. Check every line against the parser it routes to (`parseHarnessCommand`, `parseTabCommand`, `parseFileNavigatorArgs`, `parseLayoutCommand`, `parseMonitorCommand`, `parseUnmonitorCommand`, `parseShellArgument`) and against the command registry, with a throwaway test that is deleted before commit.
3. Confirm `profile list` and `resolveProfile` pick the runscripts up.

## Results

- All six runscripts written. A throwaway test, deleted before commit, checked every one of their 61 command lines. Each resolves to the intended command through `resolveCommand` and parses without error. The parsed values match the JSON: label, group, workspace, auto-approve, browser, model, effort, dock, navigator root and `in` tab, and view steps. Both models are known to the claude catalog.
- `resolveProfile` returns `runscript` for all six names, and `profile list` still shows each name once.
- No test, screenshot definition, or script launches a built-in profile by name, so nothing else picks up the change.
- Not checked: a live run in a scratch instance. Draining the system shell needs a connected window, and the request asked for no tests.

## Out of scope

- Tests, specs, help, and user documentation, per the request. The user documentation's description of the built-in profiles as JSON worked examples is now partly stale. It still calls them a worked example of the JSON format, which they remain, but launching one runs its runscript.
- Fixing the `planning` and `multitasking` navigator paths in either form.
- Deleting or changing the JSON files.
- New commands that would close the gaps above (a group-color command, a monitor name option, a relaunch-safe close).
