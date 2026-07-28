# Plan: Move the `workspace` Prefix Cluster into `src/workspace/`

**Complexity: 3/10** — a mechanical move-and-rewire refactor: three source renames, four test renames, and import path rewrites in eight importing files. No logic, signature, or behavior changes.

## Goal

Give the workspace-provisioning concern a directory namespace instead of a filename prefix. `src/workspace.ts`, `src/workspace-manager.ts`, and `src/workspace-provision-wire.ts` are one concern — provisioning, tracking, and tearing down the git clones made for `--workspace` agents and harness tabs — but express that grouping through a shared `workspace` filename prefix. Move them into `src/workspace/`, drop the now-redundant prefix from each filename, and carry every colocated test with its source.

## Approach

Follow the mechanical recipe in `ai/tasks/hygiene/improve-namespacing.md` against the `workspace` prefix. The bare entry `src/workspace.ts` becomes `src/workspace/index.ts` (an already-existing entry file being relocated, not a newly invented barrel — see `ai/guidelines/imports-and-barrel-files.md`). The other two source files drop the prefix to `manager.ts` and `provision-wire.ts`, so nothing collides inside the new directory.

Every edit inside a file is limited to the strings in its import, `vi.mock`, and dynamic-`import()` paths. Two rules cover all of them:

- **Inbound** (files that did not move): replace `workspace-` with `workspace/` in the path, and replace a trailing `workspace.js` with `workspace/index.js`. The leading `../` count never changes.
- **Outbound** (imports written inside a moved file): a path naming a sibling in the group becomes `./index.js` / `./manager.js` / `./provision-wire.js`; any other relative path gains one `../`; package and `node:` specifiers stay unchanged.

The four moved files import nothing relative except each other and the bare entry, so no outbound path needs an extra `../`.

## Move list

```
src/workspace.ts                            → src/workspace/index.ts
src/workspace.test.ts                       → src/workspace/index.test.ts
src/workspace-manager.ts                    → src/workspace/manager.ts
src/workspace-manager.test.ts               → src/workspace/manager.test.ts
src/workspace-provision-wire.ts             → src/workspace/provision-wire.ts
src/workspace-provision-wire.test.ts        → src/workspace/provision-wire.test.ts
src/workspace-repo-root.unsandboxed.test.ts → src/workspace/repo-root.unsandboxed.test.ts
```

`workspace-repo-root.unsandboxed.test.ts` has no source twin; it exercises `findRepoRoot` from the bare entry and moves with the group so the namespace's tests stay colocated.

## Inbound importers

- `src/managers.ts` — `./workspace-manager.js`
- `src/main.ts` — `./workspace.js`
- `src/github-url.ts` — `./workspace.js`
- `src/git-sync.ts` — `./workspace-manager.js` and `./workspace.js`
- `src/git-sync.test.ts` — `./workspace-manager.js` and a `vi.mock('./workspace.js')`
- `src/controller/create-managers.ts` — `../workspace-manager.js`
- `src/harness/manager.ts` — `../workspace-provision-wire.js` and `../workspace-manager.js`
- `src/profile/new-agent.ts` — `../workspace-provision-wire.js`

No `package.json` script, `tsconfig.json`, `vitest.config.ts`, or `eslint.config.mjs` entry names any of these paths literally. Every vitest project glob is `src/**/*`, which already covers the new sub-directory — including the `unsandboxed` project that owns the repo-root test.

## Implementation steps

1. `mkdir -p src/workspace`, then `git mv` each of the seven files per the move list.
2. Apply the outbound rule inside the moved files: `manager.ts` and the two tests that reference the bare entry point at `./index.js`; `manager.test.ts`'s dynamic import of the manager points at `./manager.js`; `provision-wire.test.ts` points at `./provision-wire.js`.
3. Apply the inbound rule to the eight importing files listed above.
4. Run `./scripts/run.mjs check-diff` and fix any unresolved path the compiler names, repeating until clean.
5. Grep `src` and `web` for every old stem (`workspace-manager`, `workspace-provision-wire`, `workspace-repo-root`, `workspace.js`) and repoint any surviving module path.

## Tests

No new test cases: this refactor changes no behavior, and the group's existing coverage moves with it. The four relocated test files are the coverage for the change — they must run from their new location and stay green.

- `src/workspace/index.test.ts` — provisioning, trust, temp-path, remote-URL, and teardown behavior of the bare entry.
- `src/workspace/manager.test.ts` — `WorkspaceManager` create/cancel/remove/removeAll, including its `vi.mock` of the bare entry, which must resolve through the new `./index.js` path.
- `src/workspace/provision-wire.test.ts` — `wireProvisioning` ready/failure/since-closed-tab paths.
- `src/workspace/repo-root.unsandboxed.test.ts` — stays scoped to the `unsandboxed` vitest project and keeps resolving `findRepoRoot`.
- `src/git-sync.test.ts` — its `vi.mock` of the workspace entry must still intercept, proving the inbound rewrite reached mock paths and not just static imports.

## Spec and documentation

`product/specs/` describes user-visible behavior, which this refactor does not change; no spec update applies. `help.md` and `documentation/user-documentation/` document commands and flags, not source file layout, so neither needs an edit.

## Out of scope

- Any change to what the moved code does — no logic edits, signature changes, or reformatting.
- Other prefix clusters still flat in `src/` (`git-*`, `github-*`, and similar).
- Historical path references inside `product/plans/complete/` and `CHANGELOG.md`, which are records of past work rather than live references.
