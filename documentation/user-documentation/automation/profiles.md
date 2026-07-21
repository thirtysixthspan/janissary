# Profiles

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

A profile is a saved, named set of agents and harnesses you can relaunch as one unit — a working setup for a recurring job, recreated with a single command:

```
profile launch writing-code
profile list
profile validate writing-code
```

`profile launch <name>` opens a tab for every entry in the profile: agents come back with their transcript, history, working directory, and schedule; harnesses launch fresh with whatever model, directory, workspace flag, and startup commands the profile specifies. All the launched tabs land in one new [group](/user-documentation/getting-started/groups), so the profile reads as its own colored band in the strip. `profile list` names the profiles you have; a name that doesn't exist gets `No profile named "<name>".`

![The tab strip after a profile launch: the profile's tabs grouped under one new band color, distinct from the root group.](/screenshots/profile-group.png)

## Writing a profile

<img class="agent-float left" src="/agents/tahir-south-east.png" alt="" />

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

Both kinds of entry group their tab presentation under a `tab` object: `color` (the dot color), `number` (tab order), `group`, and `groupColor`.

Profile-level configuration lives under plain top-level keys alongside the arrays: `monitors`, `files`, `notifications`, `schedules`, and `layout`. The `layout` key groups the sidebar widths under a nested `sidebar` object, e.g. `"layout": { "sidebar": { "left": 300, "right": 280 }, "tabAreaPct": 75, "window": { "width": 1280, "height": 800 } }`.

A harness entry's `run` and `schedule` live in memory only — closing the tab or quitting ends them. That's the point of the profile: the file is the source of truth, and every launch rebuilds the setup from it.

If a hand-written file has a mistake, `profile validate <name>` checks its structure and names the offending key or field — e.g. `harnesses[0]: type must be a string` — without launching it. `profile launch` on a structurally broken file opens nothing and reports `Profile "<name>" is malformed.`

## Relaunching

Launching a profile that's already running resets it: any open tab whose label matches a profile entry is closed first — processes killed, schedules dropped, workspaces removed — then everything opens fresh, with schedules re-based to now and new clones where asked. The only tab spared is the one you ran `profile launch` from; if the profile has an entry by that name, it's reported and skipped so the launch report has somewhere to land.

## A worked example

<img class="agent-float" src="/agents/fariz-south-west.png" alt="" />

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
