# Imports and Barrel Files

Prefer **direct imports**. Import each symbol from the module that actually defines it. Do **not** introduce barrel files.

A *barrel file* is a module whose only job is to re-export other modules — an `index.ts` full of `export * from './foo.js'` / `export { Bar } from './bar.js'` lines that lets callers write `import { Foo, Bar } from './feature'` instead of reaching into each file. It feels tidy. It is not worth the cost.

## What to do instead

```ts
// ✅ Direct — import from the file that defines the symbol
import { AcpLoop } from './acp/loop.js';
import { HarnessManager } from './harness/manager.js';

// ❌ Barrel — import through a re-export hub
import { AcpLoop, HarnessManager } from './acp/index.js';
```

Relative imports keep their **`.js`** extension even though the source is `.ts` (NodeNext) — see [`../../AGENTS.md`](../../AGENTS.md). A direct import names a real file that "Go to Definition" jumps straight into; a barrel adds a hop that lands you in the re-export list instead.

## The one legitimate exception: a package's public API

A barrel is appropriate as the **single published entry point of a library** — the module named by a package's `exports`/`main`, drawing a deliberate boundary between public API and internals. That is a *public surface* decision, made once at a package edge.

This codebase is an application, not a published library. We have no such boundary to draw, so we have no reason for barrels. When we group files into a namespace directory (see [`../tasks/improve-namespacing.md`](../tasks/hygiene/improve-namespacing.md)), callers import the specific file inside it (`./acp/loop.js`), not a `./acp/index.js` hub. **Do not create an `index.ts` barrel where none existed.** The improve-namespacing task only ever converts an *already-existing* bare entry file (e.g. `src/acp.ts`) into `src/acp/index.js`; it never invents a new one.

Three server modules are that kind of edge, and they are the only ones allowed to re-export:

- `src/protocol.ts` is the single wire contract (see [`architecture-principles.md`](architecture-principles.md) §7). The client reaches every wire type through `@shared/protocol`, so it re-exports the shapes that are defined beside the server code that owns them (`tab/types.ts`, `completion/types.ts`, `profile/types.ts`, `protocol/*.ts`). Pointing the client at those files instead would spread one contract across a dozen server paths and couple client code to server file layout. Server code still imports a wire type from its defining file where it can.
- `src/plugins/api.ts` is the published tab-plugin contract that plugin code imports.
- `src/plugins/fixture-v1/activate.ts` is the frozen v1 compatibility fixture, which must not change.

This is enforced, not remembered: `eslint.config.mjs` fails any `export … from` or `export *` in `src/` outside those three files. When an extraction moves a symbol out of a module, move its importers to the new file in the same change rather than re-exporting it from the old home.

**Rule.** Import every symbol directly from its defining module, with the `.js` extension. Never add a barrel/`index.ts` re-export hub to application code. A namespace is a directory of directly-imported files — not a directory fronted by a re-export index.
