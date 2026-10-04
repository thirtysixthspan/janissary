---
name: delegate-to-agents
description: >
  Delegate repository work to other agents, each running its own model, then watch them
  work and collect what they produce. Use `agent` to open a worker, `msg … request` to
  run something in it and get the answer back, and `send` to hand over a task you will
  not wait on. Prefer doing the work yourself for a task you can finish in this turn —
  delegation costs a workspace clone and a model call.
---

## When to delegate

Delegate when the work is genuinely separable and worth another agent: a long repository
playbook under `ai/tasks/`, an independent review of a diff, a search across a large tree.
Do not delegate a task you can finish yourself in this turn. Every `agent` you open is a
whole clone of the repository plus a live model session, and this turn has eight tool steps
to spend.

Delegation stops two launches deep. You are depth 0, a worker you open is depth 1, and that
worker may open one more of its own. A worker at depth 2 is refused. When a worker asks you
to delegate further, give it the work itself instead of another worker.

You may only delegate to tabs you opened — anything else answers `Cannot delegate to "…": it
is not one of your own agents.` — and only `acp`, `state`, and `db` may be run in another tab.
Anything else is refused; there is no shell. `send` allows only `acp` against an agent tab.

## One delegation is three steps

**1. Open a worker.** `agent <name>` opens it in a fresh workspace clone. Add
`--model <model-id>` to choose the model it runs on — the model must be one this host's
catalog offers, and the connections panel shows what actually launched. Without the flag the
tab uses this host's preferred ACP model.

```text
agent scout --model opencode-go/glm-5.3
```

The tab opens immediately and this tab is told when the clone is ready. Wait for that line
before handing over work. If the launch is refused — an unknown model, a `--model` with no
value, the depth limit — nothing opens and the refusal is your next prompt; do not carry on
as if a worker existed. A bare `agent` picks a name from the pool, so you will not know it
until this tab says so.

**2. Give it the task.** Two shapes, and the difference is whether you want the answer now.

Block on the answer with `msg`. The host runs the command in the worker's tab and hands you
what it produced as your next prompt:

```text
msg scout request acp "Review the diff on this branch for security issues. Report findings with file paths."
```

You are waiting for the whole run. Use it when the answer is the point.

Hand over and move on with `send`. It returns at once:

```text
send scout acp "execute ./ai/tasks/review-pull-request.md 1234"
```

**3. Collect.** A task you sent will not answer on its own — nothing is waiting on it. Tell
the worker to report back, by name, when it finishes:

```text
send scout acp "execute ./ai/tasks/review-pull-request.md 1234. When you are done, run: msg janus response <your findings>"
```

Put your own tab's name in that instruction. Use `$JANUS_AGENT_NAME` for it if you have it.
A worker you blocked on with `msg … request acp` needs no such instruction — you get its
reply directly.

## Watching a worker work

Poll the worker's transcript with `state`, which returns that tab's own log:

```text
msg scout request state
```

Each poll is one of this turn's eight tool steps, so poll for a shape you can read at a
glance rather than in a tight loop. A poll shows the worker's most recent dispatch; a command
sent to a busy worker is not queued behind what it is already doing, so a poll taken while it
is mid-turn can still show the previous one.

For a long run, do not poll at all. Ask the human to open a `harness` tab instead —
`harness <name> as <label> --model <model-id>` — and read it with `harness capture <label>`
for the screen as it is now, or `harness transcript <label>` for the harness's own session
history. Those are the better tools for an unattended playbook; `harness` is not something
you can run yourself.

## What a worker's answer looks like

A worker's answer reaches you screened. If it contained harness-shaped text — a control tag
such as `<system-reminder>`, or a line opening with `Human:` — you get one
`[harness: neutralized …]` line at the top naming what was neutralized, and the worker's own
words below it, unchanged. That marker is the host reporting, not the worker: read the answer
underneath it. Naming a setting such as `bypassPermissions` is left alone, because saying a
word is not the same as being the host.

## When it goes wrong

- **`Unknown model "…" for harness "opencode"`** — the catalog does not offer it. Use a model
  the catalog has, or drop the flag and take the default.
- **`Usage: agent <name> --model <model-id>.`** — the flag had no value after it.
- **`Cannot launch "…": a tab named "…" is already open.`** — pick another name.
- **`All agent names are in use.`** — every name is taken; close one, or name your own.
- **`Cannot delegate: this tab is already 2 agent launches deep`** — do the work in that tab
  yourself, or hand it to a shallower worker with `send`.
- **`No agent named "…".`** — the worker is not open, or the name is a display alias that no
  longer resolves.
- **`Tab not found`** — the worker closed while you were waiting. Open another and redo the
  work; a closed tab's answer is discarded, not queued.
- **`ACP: the remote session is still connecting.`** — the worker is on another host and its
  ssh channel has not finished authenticating. Ask again in a moment.
- **The answer is empty** — the worker is still running. Poll with `msg … request state`
  rather than re-sending the task, which would start it over.