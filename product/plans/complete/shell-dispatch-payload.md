# Shell tab: send the dispatch intent payload as a bare line

**Complexity: 3/10** — a one-line client change plus a rejection handler, entirely inside `web/src/plugins/shell/ShellTab.tsx`. No contract change: the server already documents and enforces a bare string.

**Goal.** Make a line typed into the shell tab's command bar do what the tab documents. Today `routeFor` sends every line not prefixed with `!` down the `dispatch` route, the host refuses the payload, and the line is silently dropped — so `ls`, `git status`, and every other ordinary command never reach zsh.

**Approach.** Change the client to send what the guard accepts and to act on the answer the host gives back. The server is already right and already tested; `src/plugins/shell/activate.test.ts` pins both that a string is accepted and that `{ line: 'ls' }` is refused, so this fix is client-only and that file must not change.

## Implementation

1. In `web/src/plugins/shell/ShellTab.tsx`, change the `dispatch` call in `submit` to pass `text` itself rather than `{ line: text }`, matching `isShellDispatch` in `src/plugins/shell/shared.ts`.
2. Branch on the returned `dispatched` flag: write the line to the terminal and append it to `sent` only when the host answered `false`. A line the application claimed runs as that command and reaches neither the shell nor its recallable history.
3. Attach a rejection handler. A rejection from this route means the plugin sent a payload its own guard refuses — a bug in this plugin rather than anything the user did — so report it through `capabilities.reportFailure` rather than leaving an unhandled rejection. Do not fall back to writing the line: a refused dispatch has not established that the shell should have it.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`:

- the payload assertion and the deferred-timing repair recorded as the second entry in `product/backlog/pull-request.md` land here too, since neither is observable until the payload is right;
- a claimed line leaves the terminal untouched and adds nothing to `sent`;
- an unclaimed line is written and is recallable.

`src/plugins/shell/activate.test.ts` keeps passing untouched, which is the proof the fix is client-only.

## Out of scope

- The vacuous-test repair as its own unit. It shares this change's test file and cannot be verified without the corrected payload, so it is done here and its backlog entry removed against this work.
- Any change to the guard, the intent table, or `dispatchLine` itself. The server's contract is correct.
- Making a refused dispatch visible to the user. The client capability object has no error surface that does not disable the plugin, and a status line in the terminal is not wanted in an output-only view.