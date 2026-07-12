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

Relative imports keep their **`.js`** extension even though the source is `.ts` (NodeNext) — see [`../../CLAUDE.md`](../../CLAUDE.md). A direct import names a real file that "Go to Definition" jumps straight into; a barrel adds a hop that lands you in the re-export list instead.

## The case against barrel files

**1. They wreck tooling and build performance.** Importing one symbol through a barrel forces TypeScript, the test runner, and the bundler to load and parse *every* module the barrel re-exports — and everything those modules pull in — even though you use one of them. The whole module subtree becomes an eager dependency of anything that touches the barrel.

- Atlassian removed barrel files across ~100,000 files and cut **build minutes by 75%**, made unit tests **~50% faster** locally (up to **10×** in some packages), and dropped CI unit-test counts **88%** (1,600 → 200) because far fewer files were transitively pulled into each test's graph.
- A Next.js app that loaded **11,000+ modules** (5–10s dev startup) fell to **~3,500 modules** (a 68% reduction) after internal barrels were removed.

**2. They defeat tree-shaking and inflate bundles.** Bundlers struggle to prove which re-exports through a barrel are unused, so dead code survives into production. Reported real-world drops after removing barrels: **752 kB → 186 kB** (Angular) and **1.5 MB → 200 kB** (Next.js). A barrel stops being tree-shakeable the moment it contains anything other than pure re-exports — even one `export const x = 5` introduces a possible side effect and disables the optimization.

**3. They breed circular dependencies.** When a file imports from the barrel of its *own* directory, it depends on a module that re-exports itself — a cycle. These often work in dev and break in production, or work under one bundler and crash under another, with cryptic errors. Direct imports between siblings (`./loop.js` importing `./manager.js`, never `./index.js`) avoid the loop entirely.

**4. They degrade day-to-day DX.** "Go to Definition" lands in the barrel instead of the implementation. Diffs and blame get noisier. The real dependency graph is hidden behind a hub, so it's harder to see what actually depends on what — the opposite of what a namespace directory is supposed to give you.

## The one legitimate exception: a package's public API

A barrel is appropriate as the **single published entry point of a library** — the module named by a package's `exports`/`main`, drawing a deliberate boundary between public API and internals. That is a *public surface* decision, made once at a package edge.

This codebase is an application, not a published library. We have no such boundary to draw, so we have no reason for barrels. When we group files into a namespace directory (see [`../tasks/improve-namespacing.md`](../tasks/improve-namespacing.md)), callers import the specific file inside it (`./acp/loop.js`), not a `./acp/index.js` hub. **Do not create an `index.ts` barrel where none existed.** The improve-namespacing task only ever converts an *already-existing* bare entry file (e.g. `src/acp.ts`) into `src/acp/index.js`; it never invents a new one.

**Rule.** Import every symbol directly from its defining module, with the `.js` extension. Never add a barrel/`index.ts` re-export hub to application code. A namespace is a directory of directly-imported files — not a directory fronted by a re-export index.

---

Sources:

- [tkdodo.eu — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [Atlassian Engineering — How We Achieved 75% Faster Builds by Removing Barrel Files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)
- [DEV — Barrel files and why you should STOP using them now](https://dev.to/tassiofront/barrel-files-and-why-you-should-stop-using-them-now-bc4)
- [Vercel/Next.js — Tree shaking doesn't work with TypeScript barrel files (#12557)](https://github.com/vercel/next.js/issues/12557)
- [laniewski.me — Why you should avoid Barrel Files in JavaScript Modules](https://laniewski.me/blog/pitfalls-of-barrel-files-in-javascript-modules/)
