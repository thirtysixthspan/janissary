# Update dompurify to 3.4.16

Complexity: 1/10

## Goal

Move the installed `dompurify` from 3.4.13 to 3.4.16, the sanitizer the web UI uses for rendered Markdown in transcripts and Markdown tabs. The existing `^3.4.11` range in `package.json` already allows 3.4.16, so only the lockfile changes.

## Approach

3.4.14–3.4.16 are patch releases: they harden reparse mutation-XSS handling for literal-text elements (`style`, `xmp`, `noscript`, …), remove attributes by exact `Attr` node so case-preserved handlers cannot survive, and add the SVG presentation attributes `pointer-events` and `vector-effect` to the allow-list. The public `sanitize` API used by `web/src/shared/transcript/markdown.ts` is unchanged, so no source change is expected.

1. Gate the target with `./scripts/run.mjs check-malicious-package dompurify@3.4.16`; proceed only on exit `0`.
2. Run `npm update dompurify` so the lockfile resolves to 3.4.16 without widening the range.

## Implementation steps

1. Gate and install `dompurify@3.4.16` as above; confirm `package-lock.json` records 3.4.16.
2. Add tests to `web/src/shared/transcript/markdown.test.ts` that pin behavior the new version provides.
3. Run `./scripts/run.mjs check-diff`.

## Tests

In `web/src/shared/transcript/markdown.test.ts`, alongside the existing sanitize cases:

- An SVG `path` carrying `pointer-events` and `vector-effect` keeps both attributes after sanitization (allowed from 3.4.16; stripped by 3.4.13).
- A raw `<style>` block whose text breaks out with `</style><img src=x onerror=…>` comes back with no `onerror` handler.

## Specs and documentation

No user-visible behavior changes beyond the sanitizer's own hardening. Functional specs, `help.md`, and public documentation remain unchanged.

## Out of scope

- Changing the `dompurify` range in `package.json`.
- Updating `marked` or any other dependency.
- Changing sanitizer configuration in `markdown.ts`.
