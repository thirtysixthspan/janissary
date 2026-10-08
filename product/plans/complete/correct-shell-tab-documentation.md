# Correct shell tab documentation

**Complexity: 3/10** — documentation-only corrections across five markdown files; no behavior changes, so the existing suites already cover what the text claims.

## Goal

Make the startup, remote shell restoration, and conversation shell-launch documentation describe the surviving shell and harness tabs. The agent-tab removal passed a blanket `agent` → `shell` substitution over prose, which left several current-behavior sections describing a shell tab as if it were the agent tab that was deleted — including claims that directly contradict the paragraph they sit in.

## Approach and settled scope

1. Correct only the claims this pull request's removal made wrong, in the five files named by the pull-request backlog entry. Leave pre-existing staleness this change did not introduce alone.
2. Treat protocol-version paragraphs in `remote-server.md` as a record of what a past version added. They describe older behavior that no longer has a current counterpart, so their `agent` wording stays; only the mechanical substitutions are reverted.
3. Keep references to ACP agents that remain accurate — the shell tab still runs the core ACP agent over its command bar, and a remote tab still runs one ACP agent per tab.
4. Change no code. The behavior the corrected text describes is already implemented and already tested.

## Implementation steps

1. `product/specs/tabs.md` § Default tab. The paragraph states every launch opens a zsh shell tab and then denies it in the same sentence ("no launch opens a shell tab"). Restate the boundary positively: the launch shell is the only tab a launch opens.
2. `product/specs/relaunch.md` item 3. "No shell tab is restored" contradicts item 4, which attaches every recorded remote session and brings its shell tabs back. Say that the launch shell is a fresh local shell and that remote shell tabs return with their recorded sessions below.
3. `product/specs/remote-server.md`:
   - § The `on <address>` clause — leave the added `zsh bekir on admin@devbox` example; `zsh <name> on <address>` parses and launches.
   - § launch, the prompt-tab paragraph — a remote shell tab shows the live ssh session in the shell tab's terminal, which is its permanent body; it does not appear over a transcript that then returns, because a shell tab has no transcript. Correct the clause to name the zsh terminal and what takes its place.
   - Protocol version paragraphs 8, 15, and 17 — revert "a shell tab's ACP agent", "harness or zsh name", and "a shell tab's shell" to the agent wording they historically described. Version 17's paragraph describes a pipe-mode shell with no terminal attached, which no surviving tab is.
   - § Lifecycle and cleanup, the detach/reattach paragraph — describe detaching and attaching a remote shell, preserving its shell and workspace, instead of an agent and its persistent shell.
   - § Lifecycle and cleanup, the parked-session paragraph — a remote shell tab has no separate persistent shell that outlives its transport; its PTY is the peer process that survives the drop and is adopted again on attach. Correct the attribution.
   - § Lifecycle and cleanup, the restoration summary — verify the "Only surviving shell and harness processes are restored" paragraph against `src/sessions/restore-tabs.ts` and `src/sessions/attach.ts` and leave it as written if accurate.
4. `documentation/user-documentation/tab-types/conversations.md` — the **New shell in this workspace** button opens a shell (`ConversationManager.launchShell` opens the shell plugin's sibling), not an agent.
5. `documentation/user-documentation/tab-types/file-navigator.md` — § Opening from a tab's metadata row contradicts itself: it grants shell tabs the 📁 button and then denies it two sentences later. Drop the leftover PTY-takeover sentence. § Remote workspaces — the navigator closes with its tab even if another joined tab still holds the shared connection.

## Tests

No new tests. The corrected text describes behavior this pull request did not change: the launch shell in `src/main.ts`, remote shell and harness restoration in `src/sessions/attach.ts` and `src/sessions/restore-tabs.ts`, the conversation's sibling-shell action in `src/conversations/manager.ts`, and the shell tab's file-navigator button. Those paths are already covered by `src/sessions/attach.test.ts`, `src/sessions/manager.test.ts`, `src/plugins/shell/activate.test.ts`, and `src/conversations/manager.test.ts`. Run `./scripts/run.mjs check-diff` to confirm the suites still pass.

## Spec updates

`product/specs/tabs.md`, `product/specs/relaunch.md`, and `product/specs/remote-server.md` are corrected in place; no spec is created or removed, and no user-visible behavior changes.

## Documentation

`documentation/user-documentation/tab-types/conversations.md` and `documentation/user-documentation/tab-types/file-navigator.md` are corrected in place. `help.md` is checked and needs no change: it describes the `zsh` command and launch behavior, neither of which changed.

## Out of scope

Source code, tests, `help.md`, other specification files, stale sentences in these files that predate this pull request, historical protocol-version content beyond reverting the mechanical substitution, and any pull request description or title edit.