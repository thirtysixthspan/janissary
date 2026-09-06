# Plan: Read the URL scheme the way the browser's parser reads it

**Complexity: 3/10** — one function, three characters, and the cases that prove it. No new module and no change to what the guard does once it has decided a string names the file scheme.

## Goal

`schemeOf` strips leading C0 controls and spaces, then reads up to the first colon. The URL parser does something else first: it **removes every ASCII tab and newline from the whole input** before it parses anything, and only then trims. So the parser and the guard disagree about any string with a tab or a newline *inside* the scheme.

`fi\tle:///etc/passwd` is the concrete case. The guard reads its scheme as `fi\tle`, which is not `file`, and relays the frame. Chromium removes the tab, parses `file:///etc/passwd`, and attempts the navigation. The same holds for a carriage return and a line feed, and at any position — `f\nile:`, `fil\re:`, `file\t:` all normalize to the file scheme.

That defeats the layer the guard exists to be. The plan of record calls the guard and the sandbox two *independent* layers, and names the guard as the one that refuses the read before it happens. A string that walks past it turns the pre-navigation refusal into a post-navigation one: `inspectServerFrame` would still catch a navigation *result* whose `url` came back as a `file:` URL, but by then the browser has already performed the operation. On a host with no Seatbelt — where the plan says the guard is the only layer — nothing else stops it at all.

## Approach

Normalize before reading, in the order the parser uses.

`schemeOf` removes all ASCII tab (U+0009), line feed (U+000A), and carriage return (U+000D) from the value, *then* skips leading C0 controls and spaces, *then* reads to the first colon. Both steps are already the parser's; only the first is missing.

Nothing else changes. The comparison stays a lowercase equality against `file`, the callers are untouched, and a string of another scheme or of ordinary text is unaffected — removing tabs and newlines cannot turn `https` or `about` into `file`, and cannot introduce a colon that was not there.

The one deliberate consequence worth naming: on the client-to-browser side every string in the frame is tested, so a string that is ordinary prose containing a tab inside something colon-terminated is now judged on its normalized form. That is the fail-closed direction, and it is the same direction the existing leading-control strip already chose.

## Implementation steps

1. `src/browser/e2e-frame-filter.ts` — add the tab/newline removal at the top of `schemeOf` and rewrite its comment to state the parser's two steps in order.
2. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-frame-filter.test.ts` — added to the existing `isFileUrl` tables so the shapes sit beside the padded-scheme cases they generalise:
  - a tab, a carriage return, and a line feed at each of three positions inside the scheme (`fi\tle:`, `f\nile:`, `fil\re:`) are all the file scheme;
  - the same characters between the scheme and its colon (`file\t:`) and combined with leading padding (`\n  fi\tle:`) are too;
  - `https`, `about`, `data`, and `notfile` with the same characters embedded are still **not** the file scheme, so the normalization has not been made to over-match;
  - a client frame carrying `fi\tle:///etc/passwd` in a `url` is blocked, and a server frame reporting one in `documentURL` is blocked.
- `src/browser/e2e-guard.test.ts` — the same string over two real sockets, which is where it matters: a `Page.navigate` frame whose URL has a tab in the scheme closes the client with 1008 and reaches the stub upstream not at all. Asserting the upstream received nothing is the point — this is a pre-navigation refusal, and a test that only checked the close code would pass even if the frame had been relayed first.

## Spec and documentation

`product/specs/sandbox.md` says a frame naming a `file:` URL ends the session and that matching is on parsed values rather than a text search. That gains the clause that makes it true: the scheme is compared after the same normalization the browser's own URL parser applies, so a scheme padded with tabs or newlines is the same scheme to both. No `help.md` or user-documentation change — neither describes the matching rules.

## Out of scope

- Other bypass classes at this boundary — percent-encoded schemes, redirects that land on `file:`, and anything the browser normalizes that a string comparison does not. This closes the tab/newline discrepancy named in the finding; it does not claim the guard is now complete, and the two-layer design does not rest on it being so.
- The inbound navigation-result check. It stays exactly as it is, and it is not the fix: it fires after the browser has acted.
- The remaining browser findings in `product/backlog/pull-request.md`.
