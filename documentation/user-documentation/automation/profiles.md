# Profiles

<img class="agent-float" src="/agents/demir-south.png" alt="" />

A profile is a saved, named set of agents and harnesses you can relaunch as one unit — a working setup for a recurring job, recreated with a single command:

```
profile launch writing-code
profile list
profile validate writing-code
```

`profile launch <name>` opens a tab for every entry in the profile. Each one starts fresh, from the entry's saved name, working directory, and tab presentation: an agent tab does not come back with the transcript, command history, or schedule it had when it was saved, and a harness launches with whatever model, directory, workspace flag, and startup commands the profile specifies. Each entry joins the [group](/user-documentation/getting-started/groups) its own `group` key names; any entry that names none instead lands in one shared new group, so a profile with no authored groups reads as its own colored band in the strip. `profile list` names the profiles you have; a name that doesn't exist gets `No profile named "<name>".`

![The tab strip after a profile launch: the profile's tabs grouped under one new band color, distinct from the root group.](/screenshots/profile-group.png)

## Picking a profile to launch

Bare `profile launch`, with no name, opens a picker with a **Project** section followed by a **Janissary** section for the profiles bundled with the app. `↑`/`↓` move the selection and skip the section labels. `Enter` or a click fills the command line with `profile launch <name>` without submitting it, so you can review or edit it first. `Escape` closes the picker without picking anything.

## Writing a profile

<img class="agent-float left" src="/agents/dogan-south-east.png" alt="" />

Your profiles live in the `profiles/` directory in your project: plain files meant to be committed and shared. Janissary also includes built-in profiles. If both sources use the same profile name, your project copy wins. Saving always writes to your project, so you can customize a built-in profile by saving a same-named replacement. Each profile is a single JSON file (dasherized, like `writing-code.json`) with one `tabs` array. Every element names its kind with a `type`, and an agent or harness entry also carries its own `name`, which becomes the tab's label:

```json
{
  "tabs": [
    { "type": "agent", "name": "planner", "number": 1 },
    {
      "type": "harness",
      "name": "builder",
      "tool": "opencode",
      "model": "openai/gpt-5",
      "workspace": true,
      "run": ["review the open pull requests"],
      "schedule": ["tests every 2h npm test"],
      "number": 2,
      "pane": "right"
    }
  ]
}
```

The eleven types are `agent`, `harness`, `editor`, `files`, `notifications`, `schedules`, `plugin`, `image`, `markdown`, `page`, and `ssh`. An agent entry uses the same format as saved agent state — just a `name` is a valid start. A harness entry names which binary to launch with a `tool` field (`claude`, `opencode`, or `codex`) — `type` already means the kind of tab — and supports a few more fields:

- **`model`** — passed to the harness verbatim; an unknown model for that harness is reported and the entry skipped.
- **`effort`** — an effort/thinking level, forwarded verbatim like `--effort` on the interactive `harness` command (translated to each harness's own flag: claude `--effort`, codex `-c model_reasoning_effort`, opencode has none). Not validated against any fixed set of levels.
- **`workspace`** — launch in a fresh [workspace clone](/user-documentation/advanced-agents/workspaced-agent). It defaults to `true`; set it to `false` to opt out.
- **`autoApprove`** — auto-approve permission prompts. It defaults to `true` for claude and codex and `false` for opencode; explicitly setting it to `true` for opencode reports an unsupported setting and skips that entry.
- **`cwd`** — starting directory. `$root` resolves to the project's launch directory and `~` to home, so you can write a portable path instead of an absolute one — a `profile save`d entry captures its `cwd` this way automatically when it's under the project root.
- **`run`** — commands typed into the harness once, shortly after launch.
- **`schedule`** — timers in the [`schedule` grammar](/user-documentation/automation/scheduling), minus the leading `schedule` keyword and any `in <tab>` clause (each line belongs to this tab). A line that doesn't parse is reported at launch and skipped.

Every entry that takes a place in the tab strip carries its presentation as plain keys alongside `type`: `color` (the dot color), `number` (tab order), `group`, `groupColor`, `pane`, and `focus`. Set `pane` to `left` or `right` to reopen that entry in a two-pane center layout; omitting it means left. Any main-area entry with `focus: true` can claim keyboard focus after launch; the lowest-numbered focused entry wins, while the other pane keeps one of its own tabs visible. Without one, the first newly opened profile tab stays active.

Two profile-level keys sit outside `tabs`, because neither is a tab: `monitors` and `layout`. The `layout` key groups the sidebar widths under a nested `sidebar` object, e.g. `"layout": { "sidebar": { "left": 300, "right": 280 }, "tabAreaPct": 75, "window": { "width": 1280, "height": 800 } }`. It applies on every launch, including a relaunch, and always wins over anything you resized by hand: any dimension the key doesn't mention resets to the app's own default rather than staying at whatever it currently is.

Use an `editor` entry to open a file directly in the in-app editor when the profile launches:

```json
{ "type": "editor", "path": "$root/product/backlog/features.md", "line": 1, "number": 3 }
```

Each has a required `path`, optional resolving tab `in`, and optional cursor `line`. `$root` resolves from the launch directory and `~` from home; another relative path resolves from `in` or the first newly opened profile tab. A missing file opens an empty buffer and is created only on save. Relaunching reuses an already-open editor tab for the same file and moves its cursor to the requested line.

The `plugin`, `page`, and `ssh` types reopen the rest of a working session — a diagram or video, a spec you keep reading, a docs site, a remote box:

```json
{ "type": "plugin", "id": "image", "path": "$root/docs/architecture.png", "number": 4 },
{ "type": "page", "url": "https://example.com/", "number": 5 },
{ "type": "ssh", "destination": "devbox", "options": ["-p", "2222"], "number": 6 }
```

A `plugin` entry names the built-in viewer that owns the tab — `image`, `markdown`, or `video` — plus the file it was opened on, and is what `profile save` writes for an open image, markdown, or video tab. The older `{ "type": "image", "path": … }` and `{ "type": "markdown", "path": … }` spellings still launch exactly the same way, so profiles you saved before are unaffected.

None of these needs a `name` — the label is derived the same way typing `open` or `ssh` derives it. Relaunching closes a page or ssh tab already showing the same url or destination before reopening it, so you end up with one of each rather than a duplicate; an already-open image, markdown, or video tab is simply reused.

A `files` entry opens a [file navigator](/user-documentation/tab-types/file-navigator), and can bring back the state of the tree itself — which directories were open, and which rows were selected:

```json
{
  "type": "files",
  "dock": "left",
  "path": "$root",
  "expanded": ["src", "src/file-navigator"],
  "cursor": "src/file-navigator/manager.ts",
  "selected": ["src/file-navigator/manager.ts"]
}
```

Every path is relative to the tree's root. Restoring is quiet and forgiving: a directory or row that no longer exists is dropped without a word, and a restored selection never steals keyboard focus — the profile's own `focus` still decides where you land. Leave off `dock` and the tree opens in the center strip instead, where it takes `number`, `group`, and `pane` like any other tab.

A harness entry's `run` and `schedule` live in memory only — closing the tab or quitting ends them. That's the point of the profile: the file is the source of truth, and every launch rebuilds the setup from it.

## Relaunching

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

Launching a profile that's already running resets it: any open tab whose label matches a profile entry is closed first — processes killed, schedules dropped, workspaces removed — then everything opens fresh, with schedules re-based to now and new clones where asked. The only tab spared is the one you ran `profile launch` from; if the profile has an entry by that name, it's reported and skipped so the launch report has somewhere to land.

## Saving the running session as a profile


`profile save <name>` captures your current session into `profiles/<name>.json`, the inverse of launching one. It writes `<name>` verbatim as the filename, with no dasherization, and captures every open tab, including the one you typed the command in. The one tab it always leaves out is the automatic root `janus` tab, since a relaunch always has its own fresh one to land in.

Each agent is captured as a clean template: its name, working directory, and tab presentation only. Command history, transcript, and any queued commands are deliberately left out, so launching the saved profile always starts that agent from scratch, not from where you left off. Each harness is captured the same way, plus its `tool`, model, effort, and workspace/offline/auto-approve flags; its scheduled and one-shot commands are never captured, since they only ever lived in memory. Whichever tab is currently active is saved with `focus: true` so a relaunch lands you back in the same place. Every captured main-area entry also saves `pane` as `left` or `right`, preserving which side of a split it occupied; the exact divider position is screen-local and resets to the middle.

Open images, markdown previews, videos, web pages, and SSH sessions are captured too — an SSH entry keeps the flags you connected with, so a relaunch reconnects the same way. Every file navigator is captured, docked or not, along with its tree view: which directories you had expanded, which row the cursor was on, and every row you had selected. Launching the profile puts the tree back the way you left it, quietly skipping anything that no longer exists. A navigator left in the center strip also remembers its group, order, and pane.

The window size, sidebar widths, and reporting-area split are captured into the profile's layout as they currently look, along with any running monitors. The only thing left out and named in the command's report is a monitor's own reporting tab.

Saving over an existing profile name atomically replaces it outright, with no confirmation prompt. Janissary keeps the previous file until the complete replacement is ready, so a capture or write failure leaves your last valid profile intact. The command reports what it captured: counts per tab type, plus monitors and docked tabs, followed by the list of anything skipped.

## Checking a profile without launching it

`profile validate <name>` checks a profile file's structure and reports either `Profile "<name>" is valid.` or every specific problem it finds, each naming the offending key, e.g. `tabs[0]: tool must be a string`. An entry with a missing or unrecognized `type` is reported the same way, listing the types it could have been. Bare `profile validate`, with no name, checks every profile in your project and reports each one's status in turn. This only checks the file's shape; problems that depend on your setup, an unknown model or harness, an unsupported `autoApprove`, are caught at launch time instead and reported per entry there.

`profile launch` on a structurally broken file opens nothing and reports `Profile "<name>" is malformed.`, pointing you at `profile validate <name>` for the details.

## A worked example

One profile that ties the pieces together — a morning code-review setup, all in `profiles/morning-review.json`:

```json
{
  "tabs": [
    { "type": "agent", "name": "triage", "number": 1 },
    {
      "type": "harness",
      "name": "reviewer",
      "tool": "claude",
      "workspace": true,
      "run": ["review the newest open PR and summarize the risky changes"],
      "schedule": ["refresh every 2h check for newly opened PRs"],
      "number": 2
    }
  ]
}
```

`profile launch morning-review` then: opens `triage` and `reviewer` as one new tab group; clones the repo into a workspace for `reviewer` ([isolated](/user-documentation/advanced-agents/workspacing) from the rest of your machine); types the `run` prompt into the harness once it's up; and keeps nudging it every two hours via its schedule — visible in the [schedule window](/user-documentation/automation/scheduling) floating over the harness. Close the tabs when you're done; tomorrow, one command rebuilds it all.
