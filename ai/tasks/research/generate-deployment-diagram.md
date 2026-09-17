# Generate Deployment Diagram

Your job: read where this system's processes actually run, and produce one self-contained HTML deployment diagram naming the transport on every connection between them, using the vendored [`diagram-design`](../../../skills/diagram-design/SKILL.md) skill to render it. This task **researches and draws**. It never edits application source, specs, or backlog files. It only reads the codebase and writes one diagram file.

This task edits **one file only**: `documentation/diagrams/deployment.html`. Every run regenerates that file in place. It is a snapshot of the hosts and wire protocols as read *today*, not an append-only history. If the file does not exist yet, this run creates it.

It has a sibling, [`generate-architecture-diagram.md`](generate-architecture-diagram.md), which owns `documentation/diagrams/architecture.html`. The two answer different questions and must not be merged:

| Diagram | Question | Nodes are | Edges are |
| --- | --- | --- | --- |
| `architecture.html` | What talks to what, inside the process? | components and registries | dispatch and delegation |
| `deployment.html` | Where does each process run, and what carries the bytes? | hosts and processes | transports, with protocol and port |

Neither task touches the other's file. If a run of this task finds itself drawing `Controller`, `Managers`, or the command registry, it has drifted into the sibling's territory and should re-read Step 2.

**No AI attribution, anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere. The commit's configured git author is the only authorship ever recorded.

**Ask once, then run to completion.** Step 3 puts one `AskUserQuestion` call in front of the user to settle the dials that change what the picture looks like. That is the only interruption. Never trigger the skill's own onboarding gate (SKILL.md §0) and never pause at its confirm-before-drawing prompt (SKILL.md §3) — Step 3 replaces both.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git. It never builds, tests, lints, or runs the app, so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean**, with no modified *and no untracked* files. This matters more than usual here: Step 6's commit stages everything with `git add -A`, so any stray file would be silently swept in. If the tree is not clean, STOP and report what is there. Do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result. No piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Read the transport surface

Read the project's own account first, then confirm it against the tree. A deployment diagram lives or dies on whether its protocol labels and version numbers are right, so this step is mostly verification.

Start with the documented account:

1. [`ai/guidelines/architecture-principles.md`](../../guidelines/architecture-principles.md), principles 1 and 9. Principle 1 establishes that there is exactly one WebSocket between server and client. Principle 9 is the local-first boundary: loopback bind, a per-session token on the WS upgrade, a Host/Origin allowlist, and an `/open/<id>` allow-list for served files. That boundary is the single most important thing this diagram draws.
2. [`product/specs/remote-server.md`](../../../product/specs/remote-server.md) for the remote story: one ssh session per host, `janus remote-serve` on the far side, and the address grammar.
3. `CLAUDE.md`'s "Project structure" section for the top-level map.
4. Skim `product/specs/` filenames for the subsystems that own a transport. `acp.md`, `browser.md`, `database.md`, `remote-server.md`, `shell.md`, `ssh-tab.md`, and `websocket-rpc.md` are the usual carriers. A subsystem with a spec is a candidate node or edge. A subsystem without one rarely is.

Then read the numbers off disk, because they move:

```bash
grep -n '"version"' package.json
grep -n 'REMOTE_PROTOCOL_VERSION' src/remote/protocol.ts
grep -rn 'ssh -t' src/remote/manager.ts
head -30 src/index.ts
head -28 src/acp/launch.ts
head -22 src/cdp-pipe.ts
```

Those six commands produce every version tag and protocol label the diagram carries. Never copy a version from a previous run of this diagram, and never copy one from the table below.

For orientation only, here is what earlier runs found. Treat it as a checklist to confirm or correct, not as content to reproduce:

| Transport | Between | Read it in |
| --- | --- | --- |
| WS + HTTP on `127.0.0.1`, token-gated | Chrome app window and the janus server | `src/index.ts` |
| CDP over a stdio pipe | janus server and the Chrome app window it spawned | `src/cdp-pipe.ts`, `src/cdp-window-resize.ts` |
| spawn / PTY | janus server and its per-tab child processes | `src/pty.ts`, `src/acp/launch.ts` |
| SSH, `-t` for a real tty | janus server and the remote host | `src/remote/manager.ts` |
| newline-delimited JSON frames, versioned | the same ssh channel, after the handshake sentinel | `src/remote/protocol.ts`, `src/remote/channel.ts` |
| HTTPS | an agent harness and the model API, on either host | `src/acp/launch.ts`, plus the provisioned tokens in `src/remote/protocol.ts` |

Note anywhere the documented account and the tree disagree. Diagram what you observe on disk. If a disagreement is material, mention it in Step 7's report rather than silently picking one source over the other.

---

## Step 2 — Build the host and transport model

Assemble the model as notes, not as diagram markup yet.

**A node is a thing with its own process or address space.** A host, a process group, a managed third-party service. Collapse siblings: every per-tab PTY, login shell, and ACP child is one node carrying artifact chips, never one node each. That is the reference's own replica rule, and it is what keeps the count survivable.

**An edge is a transport, named by protocol and, where it exists, a port.** Two processes that speak over the same physical channel in two distinguishable modes get two edges, not one. The ssh session is the standing example: it is a plain terminal until the handshake sentinel, then every byte is a frame, and drawing that as one line loses the most interesting fact about it.

**What to leave out.** Anything that does not cross a process boundary. In-process structure belongs to `architecture.html` and drawing it here produces the reference's headline anti-pattern, the logical architecture with hostnames bolted on. File I/O is not a transport, so state directories and sqlite stay off unless a run is specifically about persistence, in which case they cost a node and an edge that something else has to give up.

**The budget is tight.** `type-deployment.md` allows 3 zones, 6 infrastructure nodes, 8 network paths, 9 artifact chips, and 2 accent elements. Expect to be over on the first pass. Cut by the degrade ladder in [`references/output-spec.md`](../../../skills/diagram-design/references/output-spec.md) §3, and name whatever you cut in Step 7. A reader cannot see what is missing, and the person who asked for the diagram needs to.

**Zones are boundaries, not grouping.** Each zone must be a real trust or network boundary that something crosses. A zone that exists to tidy the layout is an anti-pattern.

---

## Step 3 — Confirm the settings with the user

Make **one** `AskUserQuestion` call carrying the four questions below. Every question leads with the recommended default, and every option says what it does to the picture rather than naming a dial. The user can answer some and skip others; anything unanswered keeps its default.

**If the user is not reachable** — a scheduled run, a non-interactive session, or an explicit instruction to run unattended — skip the call, take every default, and say so on the `Settings` line in Step 7.

| Question | Header | Options (default first) |
| --- | --- | --- |
| How large should the canvas be? | `Canvas` | **Body width** — 960×600, sits inline in a README or docs page at normal reading size. · **Full width** — 1280×720, more room for artifact chips and long protocol labels; better on a wiki page than in a narrow column. · **Slide** — 1280×720 with presentation type, readable projected, but bigger type means fewer hosts and chips fit. |
| How much should it show? | `Detail` | **Balanced** — about 6 hosts and 8 transports, chips on the ones that matter; the whole topology without a guide. · **Simplified** — about 4 hosts, no chips; the local/remote split alone, losing the model provider and the harness processes. · **Faithful** — every host and transport found, in labelled zones; dense, and it will need a moment to read. |
| How should the connections be labelled? | `Labels` | **Protocol and port** — `SSH:22`, `WS + HTTP`, `HTTPS:443`; the reason this diagram exists. · **Plain verbs** — `talks to`, `starts`, `streams from`; readable by a mixed audience, but the transports stop being the content. · **Capabilities** — what each hop achieves for the user, no protocols at all. |
| Which hosts should be in scope? | `Scope` | **Local, remote and provider** — the full picture, including the ssh channel and the model API both harnesses call. · **Local host only** — the Chrome window, the server and its child processes; drops the remote host and the ssh frame contract entirely. · **Add persistence** — the full picture plus state directories and the sqlite databases; costs a node and a path, so something else gets cut. |

The `Labels` answer is the one that decides whether this diagram is worth drawing at all. The default is what puts the transport on every edge. If a run ends up with edges reading `sends` and `connects to`, either the user asked for that or the dial got lost — check which before shipping.

---

## Step 4 — Load the diagram-design skill and draw

Invoke the `diagram-design` skill (`skills/diagram-design/SKILL.md`, vendored from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), MIT-licensed, see `skills/diagram-design/LICENSE` and `THIRD_PARTY_LICENSES.md`) via the Skill tool, then load [`references/type-deployment.md`](../../../skills/diagram-design/references/type-deployment.md) before drawing.

Fixed choices, not up for negotiation in Step 3:

- **Visual type:** `type-deployment.md`. Do not substitute `type-architecture.md`. If a run genuinely finds no boundary worth drawing, no host placement decision, and no version that matters, that is a finding to report in Step 7, not a licence to redraw the logical architecture here.
- **Style-guide gate (SKILL.md §0):** this task's explicit, standing choice is the shipped default style guide. Never trigger `references/onboarding.md`, never fetch a URL for brand tokens, never write a profile. If `references/style-guide.md` still carries the shipped tokens, that satisfies the gate as-is. Proceed.
- **Format:** `html`. Never generate `svg` or `png` for this task.

Map the Step 3 answers onto the skill's dials in [`references/output-spec.md`](../../../skills/diagram-design/references/output-spec.md):

| Step 3 answer | Dial |
| --- | --- |
| Body width / Full width / Slide | size `doc-inline` / `doc-wide` / `slide-16x9` |
| Balanced / Simplified / Faithful | detail `balanced` / `simplified` / `faithful` |
| Protocol and port / Plain verbs / Capabilities | audience `engineer` / `mixed` / `executive` |
| Local, remote and provider / Local only / Add persistence | which nodes from Step 2's model survive |

Follow `type-deployment.md` and the skill's general drawing guidance: the anti-pattern list in SKILL.md §4, the six mandatory connector rules in §6, and the complexity budget in §7. Zones are drawn first, then paths, then path labels, then nodes.

Two standing carve-outs from the type reference apply to this codebase. Both are deliberate. Repeat them, and do not treat them as errors to fix:

**1. The artifact chip version slot.** The reference calls an unversioned chip a wasted box, and it is right when the artifact is a deployed image. Several artifacts here have no pinned version to state: an `npx`-launched harness, a set of session kinds, a third-party API. When there is no real version, put the chip's *role* in the mono slot instead (`stdio`, `pty`, `sessions`, `tls`). Never invent a version number to fill the slot.

**2. The accent budget.** The reference spends its two accent elements on the single point of failure. Here they go on the janus server node, since every path terminates there, and on the versioned framed channel riding the ssh session, since that is the one transport that can silently half-work when the two ends disagree about the contract version. That overrides the reference's rule that zone-crossing paths are link-blue, for that one path only. Keep the plain ssh path beside it blue so the host boundary still reads.

Save to `documentation/diagrams/deployment.html`, creating `documentation/diagrams/` if this is the first run. Overwrite whatever is there.

Then run the skill's own check:

```bash
python3 skills/diagram-design/scripts/self_check.py documentation/diagrams/deployment.html
```

It must print `OK`. Anything else means go back and fix the file before continuing.

---

## Step 5 — Verify what changed

```bash
git status --short
```

1. The only path that may appear is `documentation/diagrams/deployment.html` (or, on a first run, the new `documentation/diagrams/` directory containing it). `architecture.html` must be untouched. If anything else changed, a reference file under `skills/diagram-design/`, a style-guide profile, application source, revert it (`git checkout -- <file>`, or remove an untracked one with `git clean -f -- <file>`) before continuing. This task draws. It does not customize the skill's shipped style or touch anything outside its one output file.
2. Read the file and sanity-check that it is a complete, well-formed HTML document: a `<!doctype html>` (or `<html>`) start, a closing `</html>`, and the diagram's `<svg>` present in between. A truncated or empty file means the draw step did not finish. Go back to Step 4 rather than shipping a broken artifact.
3. If the diff against the previous version is empty, the hosts and transports are unchanged since the last run. That is a valid, if uneventful, outcome. Skip Step 6 and report the run as a no-op in Step 7.

---

## Step 6 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `docs` type subject, e.g.:

```
docs(architecture): regenerate host and transport deployment diagram
```

The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote. No separate merge step is needed.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Diagram type:     deployment
Settings:         <canvas> · <detail> · <labels> · <scope>   (defaults | user-chosen | defaults — user not reachable)
Zones / nodes:    <count> zones, <count> nodes, <count> paths, <count> chips   (budget 3 / 6 / 8 / 9; faithful exceeds it by design)
Transports drawn: <protocol list, comma separated>
Version anchors:  janus v<version>, frame contract v<version>
Left out:         none | <what the budget forced out, and why>
Doc drift:        none | <what Step 1 found out of sync between the specs and the tree>
Output:           documentation/diagrams/deployment.html (new | regenerated | unchanged)
Commit:           <short-sha> pushed to master | push failed (see above) | no-op — diagram unchanged
```

Keep it brief. Done.
