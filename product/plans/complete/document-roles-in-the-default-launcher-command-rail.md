# Document Roles in the default launcher command rail

**Complexity: 1/10** — one sentence in one documentation page, corrected to match a list the code and the spec already state. No code, no test, no spec: the shipped default command list, its test, and the launcher spec all already include Roles; only the user-facing page that enumerates the list was left behind.

`DEFAULT_LAUNCHER_COMMANDS` gained a Roles entry between Conversations and Search, `src/plugins/launcher/commands-file.test.ts` pins the whole list including it, and `product/specs/launcher.md` names it in that order. `documentation/user-documentation/tab-types/launcher.md` still reads "the rail includes Shell, Harness, File navigator, SQL, Notifications, Schedules, Sessions, Conversations, and Search" — the list as it stood before this pull request. A reader comparing the page with their own rail finds a command missing, and a reader writing a `launcher.json` from the page has no idea Roles is configurable at all.

## Goal

- The page's built-in list matches the shipped one, in the shipped order, with Roles before Search.
- Roles is linked to the page that explains it, the way the page already links Notifications.

## Design decisions

- **Amend the sentence rather than restate the list.** The page already had the sentence and already had a link to another tab's page; replacing one clause is the whole change. Restating the list as a table would be a rewrite of a page whose job is to be read, not to be enumerated twice.
- **The link follows the page's own convention.** Notifications is linked with an absolute site path already, so Roles uses the same form, and `/user-documentation/tab-types/roles` is already in the sidebar at `documentation/.vitepress/config.mts` — no sidebar entry is added.
- **`npm run docs:build` cannot verify it here, and that is recorded rather than papered over.** The documentation build already fails in this workspace for two reasons unrelated to this page: a markdown/Vue parse error in `documentation/user-documentation/tab-types/diff.md`, and unresolved `/agents/*.png` sprites that `scripts/docs-screenshots` generates and does not check in. Running it on a clean tree produces the identical two failures. The link is therefore verified by the sidebar entry and the file on disk, which is what VitePress would resolve it against.
- **No new test, deliberately.** The code side of this fact is already pinned twice: `commands-file.test.ts` asserts the default list, and the launcher spec states it in prose. What is missing is a sentence in a Markdown file, and a unit test asserting that a documentation sentence contains a word is the implementation-mirroring test this kind of entry rules out. The link is verified where links are actually verified: `npm run docs:build`, which fails on a dead internal link.

## Implementation steps

1. **`documentation/user-documentation/tab-types/launcher.md`.** Add Roles, linked to its tab-type page, between Conversations and Search in the built-in list sentence. Nothing else on the page changes: the explanation of the project and home `launcher.json` files and their replacement behaviour stays as it is.

## Tests

None added, for the reason recorded above. Verification is the existing `src/plugins/launcher/commands-file.test.ts` default-list assertion, a direct comparison of the page's sentence against `DEFAULT_LAUNCHER_COMMANDS` and `product/specs/launcher.md`, and the link resolving inside the existing sidebar structure — the same target the sidebar already lists at `documentation/.vitepress/config.mts`.

## Out of scope

- Every other sentence in the page, including the JSON example, which correctly shows two entries and is there to show the shape rather than the list.
- Adding a test that mirrors the wording of a documentation page.
- Any change to the default command list, its icons, or its order.

## Verification

- `./scripts/run.mjs check-diff` is clean.
- The link resolves inside the existing sidebar structure: `/user-documentation/tab-types/roles` is the sidebar entry's own link and the file exists beside the launcher's.
- Read the page's sentence beside `DEFAULT_LAUNCHER_COMMANDS` and the launcher spec's paragraph: the three name the same commands in the same order.