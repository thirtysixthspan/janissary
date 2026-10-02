# Multi-Agent Tab

`fanout opencode:<model>... <prompt>` runs one prompt across several models at once, each in a
fresh disposable workspace of its own, and opens a tab lining their answers up to compare.

## The command

```
fanout opencode:google/gemini-3.1-flash-lite opencode:opencode/big-pickle what does this repository do?
```

The member list is every leading token of the form `harness:model`, and the prompt is the whole rest
of the line. Only `opencode` can be a member: `acpLaunchFor` can also drive claude and codex is in
the model catalog, but a member is an opencode model. A leading token naming another harness is
refused by name rather than taken as the start of the prompt, since the user plainly meant it as a
member. A leading token naming no harness at all — `fix:` opening a prompt — is not member-shaped,
so it begins the prompt.

Each model is validated against the opencode list in the harness catalog, the same list a `harness`
tab validates `--model` against and the same one a project replaces with
`.janissary/harness-models.json` (see [[harness]]). A member naming a model the catalog does not
carry, or one listed twice, is refused: its row reads `failed` with the reason and the rest of the
run proceeds, because a comparison of eight where one model has been retired is still worth reading.
A run whose every member was refused opens no tab and reports why.

Between one and eight members. Each is a real clone of the repository's `origin` plus a live agent
process on top of it, so the count is a disk and time cost as much as a comparison width; a count
outside that range is refused with `Usage: fanout opencode:<model>... <prompt>` before any clone is
started.

The command behaves the same on every path that dispatches a command — typed into a tab, sent to
another agent as a `command` message, or asked of it as a `request` (see [[command-routing]]). A run
started by another tab really does provision its workspaces, and the run's summary comes back as the
captured reply.

## The tab

One comparison is one tab, labelled `multi-agent`, or `multi-agent-2` and so on, and titled with the
prompt so a user with several open can tell them apart in the strip. It joins the group of the tab
that created it, exactly as an agent tab does (see [[tabs]]).

The body is the prompt once, then one row per member. A member shows its model and the word for what
it is doing — `cloning its workspace`, `working`, `answered`, `failed` — and nothing else until it
finishes, at which point its answer appears whole, rendered as Markdown the same way the transcript
renders one. There is no live streaming of an answer as it is produced.

A run is one command, one prompt, one set of members, so the body offers nothing to type into.
Closing the tab is the entire teardown: the clones are disposable, the answers *are* the tab's
content, and the connections die with it. There is no cancel command, and nothing is restored on
`--relaunch` — like a harness tab, a multi-agent tab is in-memory only.

## What a member does

A member is one opencode model working in its own clone. It is asked the prompt the instant its clone
is ready, and that readiness is the only gate.

An ordinary agent tab's ACP agent answers in prose and never touches its workspace: every tool request
is cancelled unless a persona's narrow web-tool allowlist names it (see [[acp]]). A member that
inherited that would make N concurrent clones N copies of a repository nobody writes to. So a member
is the one ACP path that also approves the agent's own tool calls, preferring the always-allow option
so a multi-step task is not stopped at every step. The grant is per connection and opt-in, and no
other connection sets it — a monitor and a persona are unaffected.

What makes that safe is the confinement: each member's process is sandboxed to its own clone and
denied every secret path, and the network can be denied the same way a workspaced tab's is (see
[[sandbox]]). Each member's clone is therefore both its workspace and its sandbox boundary, which is
why the members' workspaces do not live in the tab's own single workspace field.

A member whose clone could not be provisioned, whose connection died, or whose prompt failed reads
`failed` with the reason. A connection that has gone cannot be revived within the run.

A member is also refused when its process would not actually be confined — when workspace isolation
is switched off in configuration, or on a machine where it is unavailable — and a member with no
workspace of its own is refused for the same reason. Approving an agent's own tool calls is only
safe because a boundary keeps it inside its disposable clone; with no boundary, a row reading
`failed` with the reason is a better outcome than an unrestricted agent pointed at the user's own
checkout.

That verdict is knowable before the member is asked anything, because it depends only on the machine
and on the member's own workspace. So a `fanout` that runs where nothing can be confined reports
nothing running — `→ Comparing 0 models in "multi-agent".`, and the same for a `capture` that asked
another tab to run one — rather than announcing a comparison it cannot produce. The rows still carry
the reason, and the tab still opens: a refusal is a result, not a reason to hide the run.

## What it does not do

The tab lines answers up for a person to read. It does not judge, score or rank them, does not diff
two answers against each other, does not diff or merge what the members changed in their clones, and
does not send a second prompt into a run that already has one.

A member's clone is provisioned by `git clone` and nothing installs the project's dependencies into
it, so a member asked to run the project's own tests cannot: its answer is reasoning about the code
rather than evidence from running it.
