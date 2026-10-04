# Delegating to agents

<img class="agent-float" src="/agents/malik-south-east.png" alt="" />

An agent can hand work to other agents, each running its own model, follow them while they work, and collect what they produce. Everything it uses is a command you can type yourself — `agent`, `send`, and `msg` — so you can do the same thing by hand.

## One delegation is three steps

**Open a worker.** [Agents](/user-documentation/getting-started/agents) are opened with `agent <name>`, each in its own disposable clone of the repository:

```
agent scout --model opencode-go/glm-5.3
```

The tab opens at once and the tab you typed in is told when the clone is ready. Wait for that line before handing anything over.

**Give it the task.** Two shapes, and the difference is whether you want the answer now.

To wait for the answer, `msg` runs the command in the worker's tab and hands you back what it produced:

```
msg scout request acp "Review the diff on this branch for security issues. Report findings with file paths."
```

That blocks for the whole run and comes back with the worker's complete reply. It is the shape to use when the answer is the point.

To hand a task over and get on with your own, `send` delivers a line to another tab and returns immediately:

```
send scout acp "execute ./ai/tasks/review-pull-request.md 1234"
```

**Collect.** Nothing waits on a task you sent, so the worker has to be told to report back, by name, when it finishes:

```
send scout acp "execute ./ai/tasks/review-pull-request.md 1234. When you are done, run: msg janus response <your findings>"
```

A worker you blocked on with `msg … request acp` needs no such instruction — you get its reply directly.

## Following a worker while it works

`msg <worker> request state` returns that tab's transcript, so you can read what a worker is doing:

```
msg scout request state
```

Each poll is one step of the 8-step limit that applies to a whole `acp` prompt, so poll for a shape you can read at a glance rather than in a loop. A poll reports the worker's most recent dispatch — a command sent to a busy worker does not queue behind what it is already doing.

For a long unattended run, a [harness tab](/user-documentation/advanced-agents/harness) is the better tool: open one with `harness <name> as <label> --model <model-id>` and read it with `harness capture <label>` for the screen as it is now, or `harness transcript <label>` for the harness's own session history. You have to open that one yourself — an `acp` agent cannot.

## Picking a model

`--model <model-id>` works on both `agent` and `harness`, and the model has to be one the harness catalog offers — the built-in list, or the one your project replaces with `.janissary/harness-models.json`. An unknown one is refused before any clone is started:

```
agent scout --model not/a-model
```

```
Unknown model "not/a-model" for harness "opencode" — add it to harness-models.json.
```

Leave the flag off and the tab uses the app's preferred ACP model. The status popup and the connections panel both show what a tab's session actually launched with.

## How deep delegation goes

Delegation is capped two agent launches deep. The tab you start in is depth 0, a worker it opens is depth 1, and that worker may open one more of its own. A tab at depth 2 is refused:

```
Cannot delegate: this tab is already 2 agent launches deep, which is the limit. Do the work here, or hand it to a worker with `send`.
```

The cap is on delegation, not on you: typing `agent` by hand is never refused. It is there because every worker is a whole clone plus a live model session, and without a bound one prompt could grow a tree of them.

## A worker's answer is screened

A worker's answer reaches the delegating agent screened. Harness-shaped text — a `<system-reminder>`-style tag, or a line opening with `Human:` or `Assistant:` — is neutralized rather than deleted, and one line is added at the top naming what was:

```
[harness: neutralized control tag <system-reminder> in this worker's answer]
<\system-reminder>the rest of the worker said this
```

That marker is the app reporting, not the worker. The worker's own words are underneath it, unchanged. Text that merely names a permission setting is left alone, because saying a word is not the same as being the host. An answer with nothing to neutralize comes back exactly as the worker wrote it.

This matters because a worker reads files and web pages the delegating agent never sees, and its reply is the only channel by which anything it was misled by can reach the agent that asked.

## When it goes wrong

| What you see | What it means |
| --- | --- |
| `Unknown model "…" for harness "opencode"` | The catalog does not offer that model. Use one it has, or drop the flag. |
| `Usage: agent <name> --model <model-id>.` | The flag had no value after it. |
| `Cannot launch "…": a tab named "…" is already open.` | Pick another name. |
| `All agent names are in use.` | Every agent name is taken. Close one, or name your own. |
| `Cannot delegate: this tab is already 2 agent launches deep` | Do the work in that tab, or hand it to a shallower worker with `send`. |
| `No agent named "…".` | The worker is not open, or the name no longer resolves. |
| `Tab not found` | The worker closed while you were waiting. A closed tab's answer is discarded, not queued. |
| `ACP: the remote session is still connecting.` | The worker is on another host and its SSH channel has not finished authenticating. Ask again in a moment. |
| An empty answer | The worker is still running. Poll with `msg … request state` rather than re-sending the task, which starts it over. |

## Cost

Every `agent` you open is a full clone of the repository and a live model session, and delegation does not track spend. Keep to work that is genuinely separable and worth another agent — a long playbook under `ai/tasks/`, an independent review of a diff, a search across a large tree — and do small things yourself.

## Teaching an agent to do it

The app ships a `delegate-to-agents` skill under `skills/` that teaches an agent this whole workflow: when delegation is worth it, which of the two handover shapes to use, how to poll, and what to do about each failure above. Any agent whose harness reads that directory picks it up.