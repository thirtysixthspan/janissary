# Route a non-http scheme passed to `open` to the web opener, so it is rejected as an invalid address

**Complexity: 2/10**. One classification rule in `parseOpen` gets wider, and the web opener's existing scheme rejection does the rest. The care is in keeping local paths that contain a colon on the file branch.

## Root cause

`parseOpen` in `src/commands/open.ts` decides a target is a web address with `isPage || /^https?:\/\//i.test(target)`. A target with any other URI scheme falls through to the file branch, where `runOpenCommand` in `src/open/file-command.ts` resolves it against the tab's working directory and reports it missing. The rejection the spec describes already exists in `normalizeWebUrl` in `src/openers/web-target.ts`, which returns an error for any scheme other than `http:` and `https:`, and the page plugin turns that into `open: invalid URL "<target>"`. It's just never reached for these inputs.

## Correct behavior

`product/specs/embedded-web-page.md`: "Only `http` and `https` addresses are viewable; any other scheme (for example `javascript:`, `data:`, or `file:`) is rejected." `product/specs/open.md` lists "a non-`http`/`https` scheme" under "Unviewable or malformed web address — a message reporting the address is invalid". So `open file:///etc/passwd`, `open data:text/html,<b>x</b>` and `open javascript:alert(1)` each answer `open: invalid URL "<target>"` and open no tab, the same as their `page` forms already do.

## Reproduction

The bug report reproduced it live: each of the three answered `open: <project-dir>/<target>: no such file`, with `file:///etc/passwd` even collapsed to `file:/etc/passwd`. New tests, written before the fix, fail against it:

- `src/commands/open.test.ts` › "sets web:true for %s, so the web opener rejects its scheme", for `file:///etc/passwd`, `file:/etc/passwd`, `data:text/html,<b>x</b>`, `javascript:alert(1)`, `ftp://example.com`, and `mailto:someone@example.com`. `parseOpen` returned `web: false` for each.
- `src/controller.test.ts` › "open %s without the page keyword reports an invalid address, not a missing file", for the three targets from the report. The transcript read `open: /…/javascript:alert(1): no such file` and never `invalid URL`.

## Approach

A target is a web address when it's preceded by `page`, or when it starts with a URI scheme that can't be a local file name in practice:

- any scheme followed by `//` (`https://`, `file:///`, `ftp://`), or
- one of the schemes a browser acts on without `//`: `file`, `javascript`, `data`, `vbscript`, `about`, `blob`, `mailto`, `tel`, `sms`.

The web opener then rejects every scheme other than `http` and `https`, as it already does for the `page` form. The rule lives in `src/commands/open.ts` as a small named predicate beside `parseOpen`, and it stays pure.

A local file name like `notes:v2.md` is also a syntactically valid URI with the scheme `notes`. So "any scheme at all" would send it to the web opener and refuse to open a file that exists. The bug report's proposal risk calls this out. The rule above keeps it, and every other colon-bearing path that isn't one of those schemes (`dir/a:b.md`, `./todo:list.txt`, `12:30.log`), on the file branch.

Rejected: treating any `^[a-z][a-z\d+\-.]*:` prefix as a scheme. It's the simplest reading of the bug report, but it misroutes `notes:v2.md`. Also rejected: checking whether the path exists before classifying. That puts filesystem I/O in the parser, which architecture principle 4 forbids.

## Implementation steps

1. `src/commands/open.ts`: `carriesUrlScheme(target)` and its use in `parseOpen`, with the comment updated.
2. Tests: the parser cases and the controller cases above, plus parser cases pinning the colon-bearing file paths.

## Regression test

`src/commands/open.test.ts` › "sets web:true for %s, so the web opener rejects its scheme", and `src/controller.test.ts` › "open %s without the page keyword reports an invalid address, not a missing file".

## Verification

Run `./scripts/run.mjs check-diff`. Live: build the fix, start a scratch instance under `./temp/fix-a-bug/`, and drive it with `./temp/fix-a-bug-drivers/verify.mjs`. The driver types `open file:///etc/passwd`, `open data:text/html,<b>x</b>` and `open javascript:alert(1)` in the agent tab and records the transcript lines and the tab strip after each. Then it runs `open notes:v2.md`, a file placed in the scratch working directory before the instance starts, to confirm a colon-bearing local file still opens. Expected: three `open: invalid URL "<target>"` lines, no `no such file`, an unchanged tab strip through the three, and `notes:v2.md` opening as a tab.

Outcome: verified. `open file:///etc/passwd`, `open data:text/html,<b>x</b>` and `open javascript:alert(1)` each answered `open: invalid URL "<target>"`, and the tab strip stayed `janus` alone through all three. `open notes:v2.md` then opened a `notes:v2.md` tab.

## Spec and docs

- `product/specs/open.md`: the web-address classification names the schemes that route to the web opener, and notes that a colon-bearing file name that isn't one of them stays a file.
- `documentation/user-documentation/tab-types/opening-files.md`: its "Anything else is a file path" sentence now covers URL-shaped targets and colon-bearing file names. `help.md` doesn't describe the classification.

## Out of scope

- The page plugin's message wording.
- Opening local files through a `file:` URL, which the spec rejects.
