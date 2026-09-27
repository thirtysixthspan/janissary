# Bound the local files a data source may name

**Complexity: 4/10** — a containment check in one pure module, its mirror in the reader, three spec sentences, and tests on both sides. The judgment call is which roots count as trusted, and that is a decision rather than an implementation detail.

A source line beginning with `/`, `~`, or `.` is read with `readFileSync` after a size check and nothing else. What comes back is parsed, put into the tab payload, persisted in the record, and — once the interview runs — included in the sample sent to the model. That is a larger consequence than the `open <file>` path, which shows a file rather than copying its contents three ways, and unlike the served files it does not go through the `/open/` allow-list.

## Design decision

A file source is accepted only when it resolves inside one of two roots: the project directory the manager already holds, and the user's own home directory. The project is where a user works and where the sources they point at overwhelmingly are. Home is where a saved visualization legitimately points when it is reopened from any project, and it is the directory the record itself lives in.

Everything else is refused with a reason naming the root it would have had to be under, which is a far more useful message than "not found".

The URL path is untouched. Its scheme allowlist, timeout, redirect limit, body cap, and refusal to send credentials are already correct, and the concern here is specifically the filesystem.

`~` is expanded before the check rather than after, so a path that expands outside both roots is refused rather than being compared as a literal string that happens to start inside one.

If a bound turns out to reject a legitimate common case — a file in `/tmp`, or on a mounted volume — the honest resolution is a configured root, consulted from `src/config.ts`, and that belongs in this change rather than in a later one. The plan does not add the setting speculatively, because a setting nobody has asked for is a feature rather than a fix.

## Implementation steps

1. In `src/visualizations/source.ts`, add a containment check: expand `~` and resolve relative segments against the project directory, then accept only a path inside the project directory or the user's home. Return the same `{ kind: 'file', path }` shape on acceptance and an `{ error }` naming the root on refusal.
2. Thread the two roots in. The manager holds the project directory, and the home directory is the same one `VisualizationStore` resolves, so take both where the store is constructed rather than resolving `homedir()` a second time in a module that has no business knowing it.
3. Mirror the check in `src/visualizations/fetch.ts` so a read cannot be reached by another route — the reader's contract is that a `SourceRef` it is handed has already been checked, so the mirror is a guard on that contract rather than a second policy. Keep the size check where it is.
4. State the consequence in `product/specs/visualizations.md`: a local file is read, parsed, kept in the saved record, and included in the sample sent to the model, so a source naming a credential file exposes it to the selected model pair. Say which roots are readable.

## Tests

- `src/visualizations/source.test.ts`: a path inside the project is accepted; a path inside the home is accepted; a `~` path that expands inside the home is accepted; an absolute path into a system directory is refused naming the root; a `..` traversal out of the project is refused; a symlinked path that leaves the root is refused by the resolved path rather than by the link.
- `src/visualizations/fetch.test.ts`: a `SourceRef` that resolves outside the roots is refused by the mirror, and its existing size-cap cases keep passing.

## Out of scope

- The URL read's bounds, which are already correct and separately tested.
- Any restriction on what the model is shown beyond what is already in the record. The record is the visualization, and a user who points a visualization at a file is asking for that file to be charted.
- A configured root for sources outside the project and home. Noted above as the resolution if one is needed.

## Verification

`./scripts/run.mjs check-diff`, plus: point a visualization at a CSV in the project and confirm it reads; point one at `~/.claude.json` and confirm it reads; point one at `/etc/hosts` and confirm it is refused naming the root.
