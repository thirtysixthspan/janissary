# Document `attachTerminal`, `openFileNavigator` and `launchAgentHere` in the client capability list

**Complexity: 1/10** — three bullets in one documentation file.

**Goal.** `documentation/developer-documentation/tab-plugins.md` adds bullets for `label` and `claimedChords` to its client capability list but none for `attachTerminal`, `openFileNavigator` or `launchAgentHere`, which appear only inside the v1 changelog sentence — although the plan's documentation section promised the file "gains a bullet per new capability". The three capabilities a plugin tab with a terminal actually needs are the hardest to discover from the page a plugin author reads, so the next plugin grows its own pty plumbing and its own file-navigator and new-agent RPCs instead of using the published ones.

**Approach.** One bullet each, in the list, beside the two this pull request already added. The wording is lifted from the type comments in `web/src/plugins/api.ts` rather than written fresh: those comments are what a TypeScript user reads at the call site, and a second set of prose describing the same three methods is a second thing able to disagree with them.

`attachTerminal` needs the most, because most of what it offers is a lifetime rule rather than a signature — the handle it returns, the flush of bytes already produced, and the `detach` that has to be called or a hidden tab keeps a live subscription. The other two are one bullet between them, because they are the same idea: the metadata row's two actions, and tab-scoped RPCs rather than dispatched command lines.

## Implementation

1. Three bullets in the client capability list in `documentation/developer-documentation/tab-plugins.md`.

## Verification

`src/plugins/documentation.test.ts` reads this file for the capability counts and the manifest fixture. The client count is a literal in that test — `CLIENT_CAPABILITY_COUNT_WORD` — and the bullets do not change it: `web/src/plugins/api.ts` still declares fourteen client capabilities, which is what the count has always meant. Raising it would make the assertion pass for the wrong reason, so the count is checked against the type rather than trusted.

## Out of scope

- `registerDirtyHandle`, which the same list does not carry a bullet for either. It is a capability this pull request did not add, and its absence is a separate question.
- Any capability count. Nothing here adds a capability; it says what three existing ones do.