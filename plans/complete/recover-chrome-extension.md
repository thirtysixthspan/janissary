# Recover the Chrome frame-enabler extension

**Complexity: 3/10** — restoring two small, unchanged static config files from git history that
existing, still-wired-in code already depends on, plus one `package.json` entry and a regression
test. No new architecture; the feature's code and spec were never removed, only its two data files.

## Goal

`open <url>` / `open page <url>` renders sites that refuse to be framed (via `X-Frame-Options` or
CSP `frame-ancestors`) by stripping those headers in the app's managed Chrome — using a bundled
`declarativeNetRequest` extension. This is fully implemented and documented today (`src/main.ts`'s
`openApp` already launches Chrome with `--load-extension=<chrome-extension dir>` and
`--disable-extensions-except=<chrome-extension dir>`; `specs/embedded-web-page.md`'s "What
renders" section already describes the resulting behavior) — but the extension's own two files no
longer exist in the repo, so Chrome is launched pointing `--load-extension` at a missing/empty
directory and the extension silently fails to load. This re-adds the extension itself.

## Investigation (verified)

- `git log --all --oneline --diff-filter=D -- '*chrome*' '*extension*'` finds exactly one commit,
  `0ac8305` ("cleanup structure"), that deleted `chrome-extension/manifest.json` and
  `chrome-extension/rules.json` — 33 lines total, no other extension source (no background/content
  scripts ever existed; the extension is purely declarative). That commit is a large, unrelated
  file-reorganization commit (renaming `docs/plans` → `plans`, `spec` → `specs`, etc.); the two
  deletions look like incidental collateral, not a deliberate feature removal — nothing else
  related to the extension changed in that commit or any other.
- `src/main.ts:99,106-107` still references and passes `--load-extension`/
  `--disable-extensions-except` pointing at `chrome-extension/` (resolved relative to
  `import.meta.dirname`) — this code was never touched by the deletion and is still live.
- `plans/complete/embedded-page-framing.md` (the original design doc for this feature, still
  present) fully specifies the extension's exact intended content and lists `package.json`
  `files` as a checklist item.
- `package.json`'s `files` array currently lists `bin`, `dist`, `agent-names.json`, `help.md` —
  **no `chrome-extension`**. `git log --all -p -- package.json` shows `"chrome-extension"` present
  in this array in an earlier version of the file, confirming it was also dropped at some point
  (a packaged/published install would silently ship without the extension even once the two data
  files are restored, since `npm pack`/`npm publish` only include listed `files`).
- `specs/embedded-web-page.md:92-102` ("What renders") already accurately documents the intended
  behavior — no spec change needed.
- Recovered the exact original file contents via `git show 2433daa:chrome-extension/manifest.json`
  and `git show 2433daa:chrome-extension/rules.json` (the commit that added them, one before the
  deletion) — both are still fully valid against the current `src/main.ts` wiring (same directory
  name, same `rules.json` filename referenced from `manifest.json`).
- No existing test covers any of this: `src/main.ts` has no test file at all (it spawns real
  processes and isn't otherwise unit-tested), and nothing previously asserted the extension's own
  static files exist or are shaped correctly — which is exactly how their deletion went unnoticed.

## Approach

Restore the two extension files verbatim from git history, restore the `package.json` `files`
entry, and add a small static regression test that reads and validates both files directly (no
process spawning, no Chrome launch — just confirms the on-disk config the app depends on is
present and correctly shaped), so an accidental future deletion fails CI instead of silently
breaking the feature again.

## Implementation steps

1. **`chrome-extension/manifest.json`** (new/restored) — exact content from `git show
   2433daa:chrome-extension/manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "Janissary Frame Enabler",
     "version": "1.0",
     "description": "Removes X-Frame-Options and CSP frame-ancestors from embedded page responses so all sites render in page tabs.",
     "permissions": ["declarativeNetRequest"],
     "host_permissions": ["<all_urls>"],
     "declarative_net_request": {
       "rule_resources": [
         {
           "id": "framing",
           "enabled": true,
           "path": "rules.json"
         }
       ]
     }
   }
   ```

2. **`chrome-extension/rules.json`** (new/restored) — exact content from `git show
   2433daa:chrome-extension/rules.json`:
   ```json
   [
     {
       "id": 1,
       "priority": 1,
       "condition": {
         "resourceTypes": ["sub_frame"]
       },
       "action": {
         "type": "modifyHeaders",
         "responseHeaders": [
           { "header": "x-frame-options", "operation": "remove" },
           { "header": "content-security-policy", "operation": "remove" }
         ]
       }
     }
   ]
   ```

3. **`package.json`** — add `"chrome-extension"` back to the `files` array (alongside `bin`,
   `dist`), so a published package ships the extension directory the same way `src/main.ts`
   expects it to exist at runtime.

## Tests

**`src/chrome-extension.test.ts`** (new) — reads the two files directly from disk (relative to the
repo root via `import.meta.dirname`) and asserts their shape, so this can never silently regress
again:

1. `manifest.json` parses as JSON, has `manifest_version: 3`, `permissions` includes
   `'declarativeNetRequest'`, and `declarative_net_request.rule_resources[0].path === 'rules.json'`.
2. `rules.json` parses as JSON, is a non-empty array, and its first rule's `condition.resourceTypes`
   includes `'sub_frame'` and `action.responseHeaders` removes both `x-frame-options` and
   `content-security-policy`.
3. `package.json`'s `files` array includes `'chrome-extension'`.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, and runs the new
  test (server project).
- Manual: not verifiable in this environment (requires launching the real app with system Chrome
  installed and loading a site that refuses framing, e.g. `open https://github.com`, then
  confirming it renders in a page tab instead of showing blank/blocked). Note this as unverified
  manually in the report.

## Out of scope

- Any change to `src/main.ts`'s launch wiring — already correct and untouched by the original
  deletion.
- Any change to `specs/embedded-web-page.md` — already accurately describes this behavior.
- Building or testing an actual Chrome extension launch end-to-end (would require a real browser
  and system Chrome — out of scope for this environment and this fix's size).
- Any other framing/security behavior beyond restoring exactly what existed before the accidental
  deletion.
