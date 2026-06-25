# Type Safety & Schema Consistency Plan

## What changed from the prior draft (and why)

The prior draft correctly identified the problem (the wire types in `src/protocol.ts` and
`web/src/protocol.ts` drift) but proposed **three competing solutions to it at once**
(codegen, a Zod single-source-of-truth, and a monorepo restructure) plus runtime validation
whose value it overstated. All findings below were verified against the repo.

| Prior draft | Problem | Fix in this plan |
|---|---|---|
| Phase 1 codegen (`generate-web-protocol.ts`) **and** Phase 3 monorepo (`packages/shared-types`) **and** Phase 2 Zod-inferred types | **Three mutually-exclusive answers** to "single source of truth." Phase 3 deletes the mirror, making Phase 1's codegen pointless; Phase 2 makes schemas the source, conflicting with both. | One answer: a **single shared type file imported by both sides** (Phase 1 below). Codegen and the monorepo are dropped. |
| "Add Zod (zero runtime dependencies beyond TypeScript)" | **False** — Zod is a runtime library that executes and adds bundle weight to the web client. (It has no deps *of its own*, but it is not free at runtime.) | Validation is treated as a separate, optional concern, scoped to where it pays off (persisted state), dependency-free. |
| Phase 3 monorepo with composite project references | **Massive over-engineering.** The repo is a single package; the shared surface is ~10 type aliases that are already co-located. Converting to workspaces/`packages/*` + a reference graph + Vite alias rewiring is disproportionate. | A path alias + one shared file. No restructure. |
| Phase 2 validates **every** WS message both directions | Server and client ship from the **same build** and (after unification) typecheck against the **same definitions**; the channel is token-authed localhost. Per-message Zod here is low-ROI and adds client bundle weight. | Dropped at the WS boundary; rely on shared types + `tsc`. |
| Phase 4 config: "fail on unknown keys" | **Regression.** `src/config.ts` already degrades gracefully (try/catch → defaults, merges `Partial<Config>`). Failing on unknown keys breaks forward-compat. | Keep the lenient merge; do not add strict config validation. |
| Line refs (`index.ts:83`, `ws.ts:20`, `controller.ts:106`) | Mostly accurate (`controller.rehydrate` is 105, not 106; `ws.ts:20` is `addEventListener('message')`, not `onmessage`). | Corrected. |

### Was there a better alternative? — Yes

**A single shared type file, imported directly by the web client.** The decisive fact:
**all 8 web imports from `./protocol` are `import type`** (verified) — they are erased at
build, so importing them from a shared file adds **zero** code to the web bundle. The mirror's
own justification ("the bundler boundary prevents a shared import") is therefore false for
type-only usage. This kills drift with a path alias and a few import edits — no codegen, no
Zod, no monorepo. And once the types are shared, `tsc` on the web project **mechanically
prevents** the drift from ever recurring, which is exactly the guarantee the prior draft tried
to manufacture with a brittle "generate + diff in CI" check.

---

## Current State (verified)

Two wire-type files exist and **have already drifted**:

| | `src/protocol.ts` (canonical) | `web/src/protocol.ts` (mirror) |
|---|---|---|
| `BufferLine` | from `types.ts` — **no** `markdown?: boolean` field | inline — **has** orphan `markdown?: boolean` (line 18) |
| `TerminalEntry`, `CompletionResult` | in `types.ts` (not re-exported by protocol.ts) | inline copies |
| `ClientMessage` | defined | **missing** |
| header comment | — | points to `src/server/protocol.ts`, **which doesn't exist** |

- The orphan `BufferLine.markdown?: boolean` is dead: no web code reads it (the
  `.line.markdown` hits are CSS classes; the live usage is `line.type === 'markdown'`, present
  in both). Unifying drops it safely.
- `src/types.ts` imports are all `import type` (`node:child_process`, `./recognizers/types.js`)
  — resolvable under the web's `bundler` resolution (which accepts `.js` specifiers), erased at
  build.
- `src/config.ts` already loads config defensively (try/catch → defaults + `Partial<Config>`
  merge). The "no runtime validation anywhere" claim is overstated for config.
- There is **no web typecheck** today: `npm run build` runs `tsc` (server) then `vite build`
  (web, esbuild — no full typecheck). Drift in the mirror is currently caught by nothing.

---

## Phase 1 — Unify the wire types (the core fix)

Make `src/protocol.ts` the single source of truth and delete the mirror.

**1. Re-export the two domain types the web also needs** — in `src/protocol.ts`, extend the
final re-export:

```ts
export { type BufferLine, type ImageView, type TerminalEntry, type CompletionResult } from './types.js';
```

`src/protocol.ts` already exports `TabView`, `RouteChooserView`, `ConnectionView`,
`ScheduleView`, `ServerEvent`, `RpcCall` — together these cover every web import.

**2. Add a path alias** in `web/tsconfig.json` so web imports stay clean:

```jsonc
{
  "compilerOptions": {
    // ...existing...
    "baseUrl": ".",
    "paths": { "@shared/*": ["../src/*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

(`src/protocol.ts` is pulled into the web typecheck via the import graph; its NodeNext-style
`.js` specifiers resolve fine under `bundler` resolution.)

**3. Repoint the 8 imports** from `'./protocol'` to `'@shared/protocol'`:

| File | Imports |
|---|---|
| `web/src/ws.ts` | `ServerEvent, RpcCall, RouteChooserView, TabView` |
| `web/src/App.tsx` | `TabView, RouteChooserView` |
| `web/src/TabStrip.tsx` | `TabView` |
| `web/src/StatusPanels.tsx` | `TabView` |
| `web/src/CommandInput.tsx` | `CompletionResult` |
| `web/src/Transcript.tsx` | `BufferLine` |
| `web/src/TerminalCard.tsx` | `TerminalEntry` |
| `web/src/ImageTab.tsx` | `ImageView` |

**4. Delete `web/src/protocol.ts`.**

**5. (Optional, future-proofing)** add the same alias to `web/vite.config.ts` so a *runtime*
import from `@shared/*` would also resolve. Not required while all imports are type-only
(Vite never sees erased imports):

```ts
resolve: { alias: { '@shared': fileURLToPath(new URL('../src', import.meta.url)) } }
```

**6. Verify:** `npx tsc --noEmit -p web/tsconfig.json` (should surface any place the web
relied on a shape the server doesn't actually send) and `npm run build:web` (should still
build). Fix anything the typecheck flags — that *is* the drift being caught.

---

## Phase 2 — A typecheck script + CI gate (permanent drift prevention)

There is no full web typecheck today; add one and run both in CI. This is what makes the
shared types self-enforcing — no codegen or diff-check needed.

```jsonc
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json"
  }
}
```

CI runs `npm run typecheck`. After Phase 1, any misuse of the shared wire types — on either
side — fails the build.

---

## Phase 3 — (Optional) harden state rehydration

The one place runtime validation genuinely earns its keep: `controller.ts:105 rehydrate()`
reads `.janissary/state/*.json`. The state dir is cleared on a normal launch, so drift only
bites on `janus --relaunch` **after an upgrade**, when an old file's shape can mismatch new
code and crash rehydration.

- Wrap per-file load in a guard so a malformed/stale file is **skipped and logged**, not fatal,
  and the other tabs still restore. A small hand-written `isAgentState(x): x is AgentState`
  guard keeps this dependency-free; reach for Zod only if you want one schema for `AgentState`
  specifically — not across the whole app.
- **Leave config as-is.** `src/config.ts` already falls back to defaults on parse failure and
  merges partials; do not add "fail on unknown keys."
- The WS boundary needs no runtime validation: same build, shared types, trusted localhost.

---

## Explicitly rejected (and why)

| Approach | Why not |
|---|---|
| Monorepo / `packages/shared-types` + project references | Disproportionate restructure for ~10 shared type aliases in a single-package repo. |
| Codegen `web/src/protocol.ts` + CI `diff` | Brittle TS source-extraction to maintain a mirror that a direct import removes entirely. |
| Zod validation on every WS message | Same-build, shared-typed, localhost channel; all web consumers are type-only. Low ROI + client bundle weight. |
| Zod as global single-source-of-truth | Couples drift-elimination to a runtime dep; the shared `.ts` file already gives one source of truth at zero runtime cost. |
| Strict config validation ("fail on unknown keys") | Regression vs the current graceful default-merge; breaks forward-compat. |

---

## Summary

| Goal | Mechanism | Cost |
|---|---|---|
| Single source of truth for wire types | Phase 1: shared `src/protocol.ts` + `@shared` alias; delete mirror | a few import edits; **zero** runtime/bundle cost |
| Prevent future drift | Phase 2: `npm run typecheck` (server + web) in CI | one npm script |
| Survive stale persisted state on `--relaunch` | Phase 3 (optional): per-file guard in `rehydrate()` | small, dependency-free |

The real defect was a divergent hand-maintained mirror; the real fix is to stop maintaining a
mirror at all. Everything heavier than that was solving a problem the shared file + `tsc`
already solve.
