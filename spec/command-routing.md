# Command Routing

How an **unprefixed** command typed into a tab is classified and dispatched. Explicit commands —
built-ins (`help`, `agent`, `db …`, `connection …`, …) and the `shell ` / `db ` / `acp ` prefixes —
are resolved directly by `resolveCommand` (`src/server/resolve.ts`) and never reach routing. Anything
left over (an unrecognized, unprefixed line) is run through probabilistic recognition to decide
whether it is a shell command, a SQL query, or a natural-language agent prompt — auto-dispatching when
the guess is confident, and otherwise asking the user to pick via a **route chooser**.

The recognizers live in `src/server/recognizers/`; the dispatch and chooser logic in
`Controller.run` / `Controller.chooseRoute` (`src/server/controller.ts`); the overlay in
`web/src/RouteChooser.tsx`.

### Recognizers

Three recognizers each score a command, returning `{ match, reliability }` (reliability in `0..1`):

| Route | Recognizer | Strong signals |
|---|---|---|
| `shell` | `bash.ts` | a leading known command (`ls`, `git`, `npm`, …), an executable path (`./x`, `/x`, `~/x`), or shell metacharacters (`\| & ; < > ` `` ` `` `$(`). A command word that is also an English word (`find`, `which`, `make`, …) at the head of a prose-looking line is discounted so it reads as a prompt. |
| `db` | `db.ts` | a statement led by a SQL keyword (`SELECT`, `INSERT`, `CREATE`, `WITH`, `PRAGMA`, …), reinforced by secondary keywords (`FROM`, `WHERE`, `JOIN`, …). **Gated on the tab having an open database** — with no open connection there is nothing to query, so the route is not offered. |
| `acp` | `acp.ts` | the prose catch-all: a trailing `?`, an opening question/instruction word (`what`, `how`, `please`, `write`, `summarize`, …), or simply several mostly-alphabetic words with no symbolic punctuation. |

The db recognizer is fed the **active tab's** open databases (`openDbsFor`, derived from `tabDbConns`),
so SQL is only recognized in a tab that has actually opened a connection.

### Decision

`analyzeCommand` (`src/server/recognizers/analyze.ts`) polls every recognizer, keeps the matches sorted
by reliability, and returns one of:

- **`route`** — *confident*: the top match is at least `HIGH_RELIABILITY` (`0.7`) **and** leads the
  runner-up by at least `DOMINANCE_MARGIN` (`0.15`).
- **`ambiguous`** — otherwise (nothing matched, the best match is weak, or two routes are too close to
  call): the candidates are returned for the user to choose from.

### Dispatch

`Controller.run` acts on the decision for an unprefixed command:

- **Confident, non-db route** (`shell` / `acp`) → rewritten to its explicit form via `toPrefixedCommand`
  (`shell <cmd>` / `acp <cmd>`) and re-dispatched through the normal pipeline.
- **Confident db route with exactly one open database** → run as `db sqlite query <db> <cmd>` against
  that single database (the query needs a concrete target).
- **Everything else** — an ambiguous command, or a db route with **zero or several** open databases (no
  single obvious target) → open the **route chooser**.

A command rewritten by `toPrefixedCommand` is always explicit (`shell`/`db`/`acp`), so it resolves
directly and never re-enters routing.

### Route chooser

When routing can't decide, the server records a pending chooser — `{ label, cmd, choices }` — for the
originating tab and emits it to the client. The candidate routes come from `routeChoices(openDbs)`:
always `shell` and `acp (agent prompt)`, plus one `db query → <name>` per open database (so a SQL query
can be aimed at a specific connection).

- **Wire shape.** The chooser rides on the `state` event as `route: { cmd, choices } | null` (the
  option **labels**, in order); `null` means no chooser is open. Only one chooser exists at a time
  (the active tab's command line). See `RouteChooserView` in `src/server/protocol.ts`.
- **Client overlay.** `web/src/RouteChooser.tsx` floats above the command line listing the command and
  its options. It is **modal**: the command input is disabled while it is open. **Up/Down** move the
  selection, **Return** picks, **Escape** cancels (a row can also be clicked). The overlay closes
  automatically when the next `state` event reports `route: null`.
- **Resolution.** The client replies with the `chooseRoute` RPC carrying the selected index (or `-1` to
  cancel). `Controller.chooseRoute` clears the pending chooser and, for a valid index, runs
  `toPrefixedCommand(cmd, choice)` in the originating tab; a cancel (or out-of-range index) runs
  nothing. Either way the cleared state is broadcast so the overlay dismisses.

### Notes

- Routing only ever rewrites a command into an explicit, prefixed form — it never invents new behavior,
  so the chosen route runs exactly as if the user had typed the prefix.
- An explicit prefix always wins: prefixing with `shell `, `db `, or `acp ` bypasses recognition
  entirely, which is the deterministic escape hatch when a guess would be wrong.
