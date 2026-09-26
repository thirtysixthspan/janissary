# Give the singleton list plugins one dock-argument parser module and one "opens no files" opener

## Complexity

2/10 — one pure function moves into its own module behind the same `api.ts` re-export, one new constant-shaped helper replaces three identical opener literals, and every existing plugin test already pins the resulting behavior.

## Goal

The backlog item asked for two shared pieces across the schedules, sessions, and conversations tab plugins: one parser for the `<command> [left|right]` dock argument and one opener pair for a plugin that claims no files.

The parser half has already landed on master. #1242 published `parseDockArgument` in `src/plugins/api.ts` and removed the schedules and sessions copies, #1244 removed the conversations copy, and #1268 folded the schedules and sessions command bodies into `defineDockableList` in `src/plugins/define-list-tab.ts`. What that work left behind is a parser with no test of its own — its contract (case-insensitive `left`/`right`, surrounding whitespace ignored, empty meaning undock, anything else `undefined`) is only pinned indirectly through each plugin's docking test — living in the middle of the contract's type declarations rather than beside the other published helpers.

The opener half has not landed. All three plugins still spell out the same `opener: { inline: … rejectRequest('<id> opens no files'), external: … }` literal for a manifest that claims no extensions, so the refusal wording has three owners.

## Approach

1. Move `parseDockArgument` out of `src/plugins/api.ts` into a new `src/plugins/dock-argument.ts`, unchanged, and re-export it from `api.ts` exactly the way `defineIntents` and `defineDockableList` are re-exported, so the three plugins keep importing it from `../api.js` (the plugin import boundary in `eslint.plugin-boundaries.mjs` allows only `../api.js` and `../files.js`). `src/plugins/define-list-tab.ts` is host infrastructure, not a plugin, so it imports the parser directly from `./dock-argument.js` per `ai/guidelines/imports-and-barrel-files.md`.
2. Add `src/plugins/no-file-opener.ts` exporting `noFileOpener(pluginId)`, which returns a `TabPluginOpener` whose `inline` and `external` both call `capabilities.rejectRequest(\`${pluginId} opens no files\`)`. It takes a type-only import of `TabPluginOpener` from `./api.js`, the same shape `define-intents.ts` uses, so no runtime cycle is introduced. Re-export it from `api.ts` beside the other helpers.
3. Replace the three opener literals in `src/plugins/schedules/activate.ts`, `src/plugins/sessions/activate.ts`, and `src/plugins/conversations/activate.ts` with `opener: noFileOpener('<id>')`, keeping the "unreachable" comment at the helper rather than at each call site.

Nothing observable changes: the rejection wording and the dock grammar are identical, and `TAB_PLUGIN_API_VERSION` does not move because the published surface only gains an additive helper.

### Rejected alternative

Putting both helpers in one `dock-argument.ts`, as the backlog item proposed. The opener pair has nothing to do with docking — a future command-only plugin that is not a list would want it too — so each helper gets its own single-purpose module.

## Implementation

1. Create `src/plugins/dock-argument.ts` with `parseDockArgument` and its comment; delete the definition from `api.ts` and add the re-export; point `define-list-tab.ts` at `./dock-argument.js`.
2. Create `src/plugins/no-file-opener.ts` and re-export it from `api.ts`.
3. Switch the three plugins' `opener` to `noFileOpener`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- New `src/plugins/dock-argument.test.ts`: `left` and `right` return that side; `RIGHT` and `Left` are lowercased; surrounding whitespace is ignored; an empty or whitespace-only argument returns `null`; an unrelated word (and a side followed by a trailing word) returns `undefined`.
- New `src/plugins/no-file-opener.test.ts`: both presentations reject with `<id> opens no files`, naming the plugin passed in.
- `src/plugins/conversations/activate.test.ts`: a new case pinning that both presentations reject with `conversations opens no files`, matching the cases schedules and sessions already have.
- `src/plugins/schedules/activate.test.ts`, `src/plugins/sessions/activate.test.ts`, and `src/plugins/conversations/activate.test.ts` pin the dock and usage behavior and must pass unchanged.

## Spec

`product/specs/tab-plugins.md` ("Placing its own tab"): state the dock-argument grammar the bundled list plugins share, and that a plugin claiming no files refuses a file handed to it with `<id> opens no files`.

## Out of scope

- Merging the conversations `command` body into `defineDockableList`; its non-dock arguments open a conversation by title.
- Making `opener` optional on `TabPluginActivation`, which would be a contract change.
- Any change to usage strings, rejection wording, or the API version.
