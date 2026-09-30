# Confine the Search Plugin's Open-a-Result Path

**Complexity: 3/10** — one containment check in a plugin, one in the capability behind it, two test cases, and a documentation line. No new module and no behavior change for a legitimate result.

## Goal

A client must not be able to make the search tab open a file outside the project. Today the `open` intent carries a `path` that arrives from the client, and `SearchSession.openMatch` joins it onto the project root with `path.join`, which collapses `..` segments — so `../../../etc/passwd` resolves outside the project and is handed to `openInEditor`, which opens it in an editor tab and registers it for serving over `/open/<id>`.

That contradicts `product/specs/tab-plugins.md`, which states that "a client cannot choose another plugin, filesystem path, or served-file identity by adding fields to an intent." The tab-plugins spec is the contract the rest of the plugin system's safety rests on, so a plugin that breaks it breaks the promise every other plugin is reviewed against.

## Approach

Two checks, at the two places a path can enter:

1. **In the plugin**, refuse a result whose resolved path is outside the project root. This is the check that fixes the reported issue, and it is where the intent's path is joined.
2. **In the capability**, refuse an absolute path outside the launch directory. `openInEditor` is a new v1 capability and currently accepts any path from any plugin that declares it, so the same gap exists one level down for every future plugin. A capability is the right place for a boundary: the plugin guideline is that a capability object is what narrows a plugin's reach, and a capability that accepts any filesystem path is not narrowing anything.

Both checks are the same shape — resolve, then test containment with a trailing separator so `/repo-evil` is not accepted as inside `/repo`. Writing it once in a small module keeps the two from drifting.

## Implementation steps

1. **A containment helper, in the module plugins may already reach.** Add `isInsideRoot(root, candidate)` to `src/plugins/files.ts`, which is the sanctioned published-helper module for plugins — the server-plugin import boundary permits `api.js`, `files.js`, and two documented opener helpers, and nothing else of the host's. A new module was tried first and refused by both boundary rules, which is the boundary working: the helper has to be somewhere a plugin can import it from, and this is the only such place. It takes a root and a candidate absolute path and answers whether the candidate is the root or lies beneath it. Resolve both with `path.resolve` first, and compare against the root with a trailing separator appended, so a sibling directory whose name merely starts with the root's (`/repo-evil` beside `/repo`) is not treated as inside. Handle the empty root explicitly — the search session uses an empty root to mean "no project listed yet", and every path is outside it.

2. **The plugin check.** In `src/plugins/search/session.ts`, `SearchSession.openMatch` currently does `capabilities.openInEditor(path.join(this.root, relPath), line)` after an `if (this.root === '') return;` guard. Resolve the joined path and return without opening when it is not inside the root. The existing empty-root guard becomes redundant once the helper refuses an empty root, so it can go. Note that only a traversing path can escape: `path.join` treats an absolute path as relative to the root, so an `open` intent naming `/etc/passwd` resolves to a file *inside* the project and is a legitimate result — a test asserting otherwise would be asserting the wrong thing.

3. **The capability check.** In `src/plugins/context.ts`, the `openInEditor` implementation delegates straight to `managers.openFile.edit`. Resolve the incoming `absPath` and return without opening when it is not inside `managers.tab.launchDir`. The context already imports from `../project/files.js`, so the helper import sits beside it.

4. **Document the boundary.** In `documentation/developer-documentation/tab-plugins.md`, the `openInEditor` bullet currently says the file "is served by the authenticated `/open/<id>` allow-list like any other editor open" without saying what path it will accept. Add a sentence naming the confinement: a path outside the launch directory is refused. The API changelog entry for v1 already records the capability; it does not need changing, since the capability's meaning is unchanged and only its refusal is now specified.

## Tests

- `src/plugins/search/activate.test.ts`: an `open` intent naming a traversing path (`../../../etc/passwd`) calls neither `openInEditor` nor `openPluginTab`, and the tab's rows are untouched. The existing case asserting a result opens at its line must keep passing, since a legitimate project-relative path is inside the root.
- `src/plugins/context.test.ts`: `openInEditor` with an absolute path outside the launch directory calls nothing on `managers.openFile`; with a path inside it, the existing delegation assertion still holds. The existing undeclared-capability case must keep passing untouched, and the manager fixture needs a `launchDir` for the inside case to be inside.
- `src/plugins/files.test.ts`: cases for the helper covering the root itself, a direct child, a deeply nested child, a `..` escape, an absolute path elsewhere, a sibling directory sharing the root's name prefix, a relative candidate resolved against the process directory, and the empty root.

No existing test asserts the current escaping behavior, so nothing has to be weakened to land this.

## Out of scope

- Changing what a plugin may do with the files it legitimately listed. Only paths outside the launch directory are refused.
- Confinement for the file navigator or any other opener. Those resolve through their own paths and this change does not touch them.
- Whether the editor tab should itself refuse an out-of-project path on some other route, such as `edit ../../../etc/passwd` typed by a user. That is a separate question about the `edit` command, not about this capability.
