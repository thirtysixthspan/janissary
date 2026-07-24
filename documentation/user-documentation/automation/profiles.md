# Profiles

<img class="agent-float" src="/agents/aslan-south-east.png" alt="" />

A profile is a saved, named set of agents and harnesses you can relaunch as one unit — a working setup for a recurring job, recreated with a single command:

```
profile launch writing-code
profile list
profile validate writing-code
```

`profile launch <name>` opens a tab for every entry in the profile. Each one starts fresh, from the entry's saved name, working directory, and tab presentation: an agent tab does not come back with the transcript, command history, or schedule it had when it was saved, and a harness launches with whatever model, directory, workspace flag, and startup commands the profile specifies. All the launched tabs land in one new [group](/user-documentation/getting-started/groups), so the profile reads as its own colored band in the strip. `profile list` names the profiles you have; a name that doesn't exist gets `No profile named "<name>".`

![The tab strip after a profile launch: the profile's tabs grouped under one new band color, distinct from the root group.](/screenshots/profile-group.png)

## Picking a profile to launch

Bare `profile launch`, with no name, opens a picker listing every profile in your project instead of erroring. `↑`/`↓` move the selection, and `Enter` or a click fills the command line with `profile launch <name>` without submitting it, so you can review or edit it first. `Escape` closes the picker without picking anything.

## Writing a profile

<img class="agent-float left" src="/agents/bilal-south-west.png" alt="" />

Profiles live in a `profiles/` directory in your project — plain files, meant to be committed and shared. Each profile is a single JSON file (dasherized, like `writing-code.json`) with an `agents` array and a `harnesses` array; every entry carries its own `name`, which becomes the tab's label:

```json
{
  "agents": [
    { "name": "planner", "tab": { "number": 1 } }
  ],
  "harnesses": [
    {
      "name": "builder",
      "type": "opencode",
      "model": "openai/gpt-5",
      "workspace": true,
      "run": ["review the open pull requests"],
      "schedule": ["tests every 2h npm test"],
      "tab": { "number": 2 }
    }
  ]
}
```

An agent entry uses the same format as saved agent state — just a `name` is a valid start. A harness entry names which binary to launch with a `type` field (`claude`, `opencode`, or `codex`) and supports a few more fields:

- **`model`** — passed to the harness verbatim; an unknown model for that harness is reported and the entry skipped.
- **`effort`** — an effort/thinking level, forwarded verbatim like `--effort` on the interactive `harness` command (translated to each harness's own flag: claude `--effort`, codex `-c model_reasoning_effort`, opencode has none). Not validated against any fixed set of levels.
- **`workspace`** — launch in a fresh [workspace clone](/user-documentation/advanced-agents/workspaced-agent), like `-w`.
- **`cwd`** — starting directory. `$root` resolves to the project's launch directory and `~` to home, so you can write a portable path instead of an absolute one — a `profile save`d entry captures its `cwd` this way automatically when it's under the project root.
- **`run`** — commands typed into the harness once, shortly after launch.
- **`schedule`** — timers in the [`schedule` grammar](/user-documentation/automation/scheduling), minus the leading `schedule` keyword and any `in <tab>` clause (each line belongs to this tab). A line that doesn't parse is reported at launch and skipped.

Both kinds of entry group their tab presentation under a `tab` object: `color` (the dot color), `number` (tab order), `group`, `groupColor`, and `focus`. Any agent, harness, or editor entry with `focus: true` can claim the main area after launch; the lowest-numbered focused entry wins. Without one, the first newly opened profile tab stays active.

Profile-level configuration lives under plain top-level keys alongside the arrays: `monitors`, `files`, `editors`, `notifications`, `schedules`, and `layout`. The `layout` key groups the sidebar widths under a nested `sidebar` object, e.g. `"layout": { "sidebar": { "left": 300, "right": 280 }, "tabAreaPct": 75, "window": { "width": 1280, "height": 800 } }`. It applies on every launch, including a relaunch, and always wins over anything you resized by hand: any dimension the key doesn't mention resets to the app's own default rather than staying at whatever it currently is.

Use `editors` to open files directly in the in-app editor when the profile launches:

```json
"editors": [
  { "path": "$root/product/backlog/features.md", "line": 1, "tab": { "number": 3 } }
]
```

Each entry has a required `path`, optional resolving tab `in`, optional cursor `line`, and optional `tab` presentation. `$root` resolves from the launch directory and `~` from home; another relative path resolves from `in` or the first newly opened profile tab. A missing file opens an empty buffer and is created only on save. Relaunching reuses an already-open editor tab for the same file and moves its cursor to the requested line.

A harness entry's `run` and `schedule` live in memory only — closing the tab or quitting ends them. That's the point of the profile: the file is the source of truth, and every launch rebuilds the setup from it.

## Relaunching

Launching a profile that's already running resets it: any open tab whose label matches a profile entry is closed first — processes killed, schedules dropped, workspaces removed — then everything opens fresh, with schedules re-based to now and new clones where asked. The only tab spared is the one you ran `profile launch` from; if the profile has an entry by that name, it's reported and skipped so the launch report has somewhere to land.

## Saving the running session as a profile


`profile save <name>` captures your current session into `profiles/<name>.json`, the inverse of launching one. It writes `<name>` verbatim as the filename, with no dasherization, and captures every open tab, including the one you typed the command in. The one tab it always leaves out is the automatic root `janus` tab, since a relaunch always has its own fresh one to land in.

Each agent is captured as a clean template: its name, working directory, and tab presentation only. Command history, transcript, and any queued commands are deliberately left out, so launching the saved profile always starts that agent from scratch, not from where you left off. Each harness is captured the same way, plus its type, model, effort, and workspace/offline/auto-approve flags; its scheduled and one-shot commands are never captured, since they only ever lived in memory. Whichever tab is currently active is saved with `tab.focus: true` so a relaunch lands you back in the same place; editor tabs are launch-only and are never captured.

The window size, sidebar widths, and reporting-area split are captured into the profile's layout as they currently look, along with any running monitors and any file navigator, notifications, or schedules tab docked to a sidebar. A tab with no profile equivalent, an image, a web page, a markdown viewer, an editor, an SSH session, or an undocked file navigator, is left out and named in the command's report so you know what didn't make it in.

Saving over an existing profile name replaces it outright, with no confirmation prompt. The command reports what it captured: counts of agents, harnesses, monitors, and docked tabs, followed by the list of anything skipped.

## Checking a profile without launching it

`profile validate <name>` checks a profile file's structure and reports either `Profile "<name>" is valid.` or every specific problem it finds, each naming the offending key, e.g. `harnesses[0]: type must be a string`. Bare `profile validate`, with no name, checks every profile in your project and reports each one's status in turn. This only checks the file's shape; problems that depend on your setup, an unknown model or harness, an unsupported `autoApprove`, are caught at launch time instead and reported per entry there.

`profile launch` on a structurally broken file opens nothing and reports `Profile "<name>" is malformed.`, pointing you at `profile validate <name>` for the details.

## A worked example

One profile that ties the pieces together — a morning code-review setup, all in `profiles/morning-review.json`:

```json
{
  "agents": [
    { "name": "triage", "tab": { "number": 1 } }
  ],
  "harnesses": [
    {
      "name": "reviewer",
      "type": "claude",
      "workspace": true,
      "run": ["review the newest open PR and summarize the risky changes"],
      "schedule": ["refresh every 2h check for newly opened PRs"],
      "tab": { "number": 2 }
    }
  ]
}
```

`profile launch morning-review` then: opens `triage` and `reviewer` as one new tab group; clones the repo into a workspace for `reviewer` ([isolated](/user-documentation/advanced-agents/workspacing) from the rest of your machine); types the `run` prompt into the harness once it's up; and keeps nudging it every two hours via its schedule — visible in the [schedule window](/user-documentation/automation/scheduling) floating over the harness. Close the tabs when you're done; tomorrow, one command rebuilds it all.
