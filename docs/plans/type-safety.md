# Type Safety & Schema Consistency Plan

## Current State

The app has two TypeScript compilation pipelines that cannot share type definitions directly:

| Target | Config | Module | Resolution |
|---|---|---|---|
| Server (`src/`) | `tsconfig.json` | `NodeNext` | `NodeNext` |
| Web client (`web/`) | `web/tsconfig.json` | `ESNext` | `bundler` |

Wire types are defined in `src/protocol.ts` and **manually mirrored** in `web/src/protocol.ts`. Both files are annotated "keep in sync". There is no runtime validation anywhere — `JSON.parse()` is used with type assertions.

### Three surfaces where data schema can drift

| Surface | Format | Risk |
|---|---|---|
| WebSocket messages (`ServerEvent` / `RpcCall`) | JSON over wire | Out-of-sync types → runtime crashes |
| Persisted agent state (`.janissary/state/*.json`) | JSON on disk | Schema changes break `--relaunch` rehydration |
| Config (`.janissary/config.json`) | JSON on disk | Missing/malformed fields silently ignored |

### Discrepancy found

`web/src/protocol.ts:18` has `markdown?: boolean` on `BufferLine` that `src/types.ts:41-53` does not. (Dead code — `flattenBuffer` never sets it — but demonstrates how easily manual mirrors drift.)

---

## Phase 1 — Type Generation (eliminate manual mirroring)

Add a build script that generates `web/src/protocol.ts` from the canonical `src/protocol.ts` (and the relevant subset of `src/types.ts`).

**Script (`scripts/generate-web-protocol.ts`):**
1. Read `src/protocol.ts` — extract type/export declarations
2. Read `src/types.ts` — extract `BufferLine`, `ImageView` types (the only domain types the client uses)
3. Rewrite import paths: replace `from './types.js'` with the inline type definitions
4. Write `web/src/protocol.ts`

**`package.json` addition:**
```json
"generate": "tsx scripts/generate-web-protocol.ts"
```

**CI check:** `diff --exit-code web/src/protocol.ts` after regeneration — fail if out of date.

---

## Phase 2 — Runtime Schema Validation

Add Zod (zero runtime dependencies beyond TypeScript) and validate every message at the WebSocket boundary.

**New file: `src/schemas.ts`** — Zod schemas for wire types:
- `ServerEventSchema` — validates every server→client message shape
- `RpcCallSchema` — validates every client→server request
- `AgentStateSchema` — validates persisted state files
- `ConfigSchema` — validates config.json

**Validation hooks:**
| Location | What | Action on failure |
|---|---|---|
| `src/index.ts:83` — server `ws.on('message')` | Parse + validate as `RpcCall` | Log warning, drop message, no crash |
| `web/src/ws.ts:20` — client `onmessage` | Parse + validate as `ServerEvent` | Log warning, drop event, no crash |
| `src/controller.ts:106` — `rehydrate()` | Validate each agent state file | Skip malformed state, log warning, continue |
| `src/config.ts` — config load | Validate `ConfigSchema` | Merge defaults where missing, fail on unknown keys |

Generated types from Zod schemas (`z.infer<typeof X>`) replace the hand-written types, making the schemas the single source of truth.

---

## Phase 3 — Shared Package (TypeScript project references)

Convert to TypeScript project references so types can be shared at compile time.

```
janissary/
├── tsconfig.json            # "references": ["packages/shared-types", "packages/server", "web"]
├── packages/
│   └── shared-types/
│       ├── package.json     # (optional, or just tsconfig)
│       ├── tsconfig.json    # "composite": true, "declaration": true
│       └── src/
│           ├── protocol.ts  # wire types (single source of truth)
│           ├── types.ts     # core domain types
│           └── schemas.ts   # Zod schemas + inferred types
├── web/
│   └── src/
│       └── tsconfig.json    # "references": ["../../packages/shared-types"]
│                            # "paths": { "@janissary/shared-types": ["../../packages/shared-types/src"] }
```

The web client imports `{ ServerEvent }` from `@janissary/shared-types`. Vite resolves this to source `.ts` files via TypeScript path aliases and bundles them. The server resolves to the same source.

This eliminates the mirror entirely — `web/src/protocol.ts` is deleted.

---

## Phase 4 — Hardened Persistence

| File | Validation | Strategy |
|---|---|---|
| `.janissary/state/*.json` | `AgentStateSchema` | Skip malformed files on rehydration; log warning |
| `.janissary/config.json` | `ConfigSchema` | Apply defaults for missing fields (backward compat); fail on unknown keys |
| `.janissary/log/*.json` | None (write-only) | Acceptable as-is — human/append-only |

---

## Phase 5 — CI Checks

1. **Protocol generation check** — `scripts/generate-web-protocol.ts` must produce same output as committed `web/src/protocol.ts`
2. **TypeScript strict check** — `tsc --noEmit` for both server and web
3. **Schema validation test** — send known-malformed messages through the WebSocket handler; assert graceful rejection (no crash, logged warning)
4. **State rehydration test** — feed malformed agent state files; assert they are skipped without crashing
