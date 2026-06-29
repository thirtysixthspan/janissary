# Type Safety & Schema Consistency Plan

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
- There is **no web typecheck** today: `npm run build` runs `tsc` (server) then `vite build`
  (web, esbuild — no full typecheck). Drift in the mirror is currently caught by nothing.

All 8 web imports from `./protocol` are `import type` (verified) — erased at build — so importing them from a shared file adds **zero** code to the web bundle. A path alias and a few import edits are all that is needed.

---

## Phase 1 — Unify the wire types

Make `src/protocol.ts` the single source of truth and delete the mirror.

**1. Re-export the two domain types the web also needs** — in `src/protocol.ts`, extend the final re-export:

```ts
export { type BufferLine, type ImageView, type TerminalEntry, type CompletionResult } from './types.js';
```

`src/protocol.ts` already exports `TabView`, `RouteChooserView`, `ConnectionView`, `ScheduleView`, `ServerEvent`, `RpcCall` — together these cover every web import.

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

(`src/protocol.ts` is pulled into the web typecheck via the import graph; its NodeNext-style `.js` specifiers resolve fine under `bundler` resolution.)

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

**5. (Optional, future-proofing)** add the same alias to `web/vite.config.ts` so a *runtime* import from `@shared/*` would also resolve. Not required while all imports are type-only (Vite never sees erased imports):

```ts
resolve: { alias: { '@shared': fileURLToPath(new URL('../src', import.meta.url)) } }
```

**6. Verify:** `npx tsc --noEmit -p web/tsconfig.json` (should surface any place the web relied on a shape the server doesn't actually send) and `npm run build:web` (should still build). Fix anything the typecheck flags — that *is* the drift being caught.

---

## Phase 2 — Typecheck script + CI gate

There is no full web typecheck today; add one and run both in CI. This is what makes the shared types self-enforcing — no codegen or diff-check needed.

```jsonc
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json"
  }
}
```

CI runs `npm run typecheck`. After Phase 1, any misuse of the shared wire types — on either side — fails the build.

---

## Phase 3 — (Optional) harden state rehydration

The one place runtime validation genuinely earns its keep: `controller.ts:105 rehydrate()` reads `.janissary/state/*.json`. The state dir is cleared on a normal launch, so drift only bites on `janus --relaunch` **after an upgrade**, when an old file's shape can mismatch new code and crash rehydration.

- Wrap per-file load in a guard so a malformed/stale file is **skipped and logged**, not fatal,
  and the other tabs still restore. A small hand-written `isAgentState(x): x is AgentState`
  guard keeps this dependency-free; reach for Zod only if you want one schema for `AgentState`
  specifically — not across the whole app.
- **Leave config as-is.** `src/config.ts` already falls back to defaults on parse failure and
  merges partials; do not add "fail on unknown keys."
- The WS boundary needs no runtime validation: same build, shared types, trusted localhost.
