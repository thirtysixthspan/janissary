# Hand the harness launch path the parsed launch record it already has

## Complexity

5/10 — a private signature change threaded through the harness manager's launch path, a new named export in the command parser, and a call-site rewrite; every observable behavior is unchanged and four end-to-end suites pin that.

## Goal

`HarnessManager.run` destructures the `HarnessParsed` record returned by `parseHarnessCommand` and passes its ten fields positionally into the private `open`, whose signature runs `name, workspace, offline, autoApprove, browser, label_?, model?, effort?, prompt?, remote?` — four consecutive booleans followed by four consecutive optional strings. Transposing two of those booleans typechecks and ships: `autoApprove` swapped with `offline` launches a harness that auto-approves its own permission prompts when the user asked only for a network-denied sandbox. `SpawnTabOptions` one layer down was already grouped into an object for exactly this reason.

## Approach

1. **`src/harness/command-parse.ts`** — name the launch variant of the `HarnessParsed` union and export it:
   ```ts
   export type HarnessLaunch = {
     name: string; workspace: boolean; offline: boolean; autoApprove: boolean; browser: boolean;
     label?: string; model?: string; effort?: string; prompt?: string; remote?: RemoteAddress;
   };
   ```
   `HarnessParsed` becomes `HarnessLaunch | { capture: … } | { transcript: … } | { error: string }` — same union, same members, no behavioral change.
2. **`src/harness/manager.ts`** — change the private `open` to take one object argument of type `HarnessLaunch`, destructure by name inside, and keep every existing behavior: `uniqueLabel(this.managers.tab.tabs, label ?? name)`, the `resolveLaunchDir` call gated on `workspace && !remote`, the creator-derived `group`/`groupColor`, the `spawnTab` call, and the `prompt` one-shot schedule entry. Change `run`'s call from the ten-argument spread to `this.open(parsed)` — `run` has already narrowed away the `error`/`capture`/`transcript` variants by that point, so `parsed` is the launch record.
3. Leave `openFromProfile` alone — it already builds `SpawnTabOptions` by name from a `ProfileHarnessEntry`.

## Implementation

1. Extract and export `HarnessLaunch` from `command-parse.ts`.
2. Rewrite `open`'s signature and `run`'s call in `manager.ts`.
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

No new tests — the record is matched by name afterward, and a rename becomes a compile error. `src/harness/manager.test.ts`, `src/harness/manager-browser.test.ts`, `src/harness/manager-browser-remote.test.ts`, and `src/harness/command-parse.test.ts` drive these launches end to end and pin which flags reach the spawn; all four keep passing untouched, since `run`'s signature and every observable behavior are unchanged.

## Out of scope

- `openFromProfile` and `SpawnTabOptions` themselves.
- Any behavior change to launches, parsing, or scheduling.
