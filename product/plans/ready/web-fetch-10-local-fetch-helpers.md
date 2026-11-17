# Web fetch 10 — helpers for the `local` provider

**Complexity: 6/10** — ~105 added lines in 2 new modules, 0 files edited, 17 requirements, 33 test scenarios (mostly host-check and stream-cap edge cases) (p=5.98)

Run order: 10 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Content types", "Response size limit", "Decoding and status", and "HTTP upgrade" decisions under "The `local` provider", and the last sentence of the "`local` fetch" bullet under "Provider contract, registry, and catalog"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` (the `src/web/providers/` home and `ProviderRequestError` there). It doesn't depend on subplans 2 to 9 and touches none of their files, so it lands in any order after subplan 1.

The `local` provider fetches a page directly from the machine that owns the tab. Four of its rules can be built and tested without any network or redirect logic. The first decides when an `http:` URL is upgraded to `https:`. The second decides which `Content-Type` values are text it may return. The third decodes a body with its declared charset. The fourth reads a body with a 50 MB cap without buffering an oversized one. This plan adds those helpers. Subplans 11 and 12 build the provider on them, so its module stays under 200 lines (source plan, `local` fetch). Nothing outside the new tests calls the helpers until subplan 11.

Paths below are the post-rename ones. At today's baseline `ProviderRequestError` is `src/web-search/contract.ts:66` (`export class ProviderRequestError extends Error {`); subplan 1 moves it to `src/web/providers/contract.ts` unchanged. Both new modules import it from `./contract.js`.

## Design decisions

- **HTTP upgrade host check (source plan, HTTP upgrade).** A private (not exported) predicate `keepsHttp(url)` in a new `src/web/providers/local-rules.ts` takes a WHATWG `URL` and reads only its `hostname`. It does no DNS lookup. It checks three rules in this order, and the URL stays `http:` when any holds:
  1. The host is an IP literal inside a loopback, private, or link-local range. Node's `URL` keeps the brackets around an IPv6 `hostname` (`new URL('http://[::1]/').hostname` is `[::1]`, and `net.isIP('[::1]')` is `0`), so strip one leading `[` and trailing `]` before calling `net.isIP`. When `net.isIP` returns `4` or `6`, the BlockList answer below decides, and the other two rules are skipped.
  2. The host is `localhost` or ends in `.localhost`.
  3. The host is a single label with no dot.
  Rule 1 runs first and ends the check for every IP literal because an IPv6 literal contains no dot. Without that ordering, `http://[2001:db8::1]/` would count as a single label and wrongly stay `http:`. Before rules 2 and 3, drop one trailing dot, so `localhost.` and `intranet.` keep `http:` while `example.com.` is still upgraded. The `URL` parser already lowercases the host and normalizes legacy IPv4 forms (`http://2130706433/` and `http://0x7f.1/` both have the hostname `127.0.0.1`), so no further normalization is added.
- **The ranges (source plan, HTTP upgrade).** Hold them in one module-level `net.BlockList` with the subnets `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (type `ipv4`), and `::1/128`, `fc00::/7`, `fe80::/10` (type `ipv6`). Call `check(address, family)` with `'ipv4'` when `net.isIP` returned `4` and `'ipv6'` when it returned `6`. The family argument is required in practice: `check` defaults to `'ipv4'` and returns `false` for an IPv6 address checked as IPv4. `BlockList` matches an IPv4-mapped IPv6 address against the IPv4 subnets, so `http://[::ffff:192.168.1.1]/` (hostname `[::ffff:c0a8:101]`) keeps `http:` with no extra code. Do no hand-written range arithmetic. Import `BlockList` and `isIP` from `node:net`, the `node:` form the repo uses (for example `src/remote/serve-detach.ts`). Building the `BlockList` at module top level is pure data and opens nothing, so it doesn't break the no-side-effect rule (`ai/guidelines/plugins.md` §6).
- **`upgradedUrl` (source plan, HTTP upgrade).** The exported `upgradedUrl(url)` takes a `URL` and always returns a new `URL`, never mutating its argument. Subplan 11 calls it as `upgradedUrl(new URL(request.url))`, and subplan 12 calls it on each same-host redirect target. When the protocol is `http:` and `keepsHttp` is false, the copy's protocol is set to `https:`. In every other case the copy is unchanged, so an `https:` URL is never downgraded. Setting the protocol keeps the path, query, fragment, and a non-default port (`http://example.com:8080/a?b#c` becomes `https://example.com:8080/a?b#c`). An explicit `:443` on an `http:` URL becomes the `https:` default and disappears from the `href`, which is the parser's behavior and needs no special case.
- **Content types (source plan, Content types).** The exported `acceptedContentType(header)` takes the `Content-Type` value as `Headers.get` returns it, a string or `null`. It reads the media type: the text before the first `;`, trimmed and lowercased. It returns that media type when it is accepted and throws otherwise. Five forms are accepted:
  - any media type starting with `text/` (HTML included);
  - `application/xhtml+xml`;
  - `application/json`;
  - `application/xml`;
  - any media type whose subtype ends in `+json` or `+xml`, whatever its top-level type (so `application/ld+json` and `image/svg+xml` are accepted).
  Everything else is refused, including PDF, images, audio, video, and other binary. A `null`, empty, or whitespace-only header counts as `application/octet-stream` and is refused; RFC 9110 lets a recipient assume that type, and the plan returns only declared text. The refusal throws `ProviderRequestError` with the reason `unsupported content type <media type>`, naming the lowercased media type without parameters. So `Application/PDF; x=y` gives `unsupported content type application/pdf`, and a missing header gives `unsupported content type application/octet-stream`.
- **Charset decoding (source plan, Decoding and status).** The exported `decodeBody(bytes, contentType)` takes a `Uint8Array` and the same `string | null` header value, and returns a string. It reads the `charset` parameter. Split the header's parameters on `;`, and find the first one whose name, trimmed and lowercased, is `charset`. Take its value, trimmed, with one pair of surrounding double quotes removed. Stripping the quotes matters: `new TextDecoder('"windows-1252"')` throws, so an unstripped quoted label would silently fall back to UTF-8. Decode with `new TextDecoder(label)` in its default non-fatal mode, which replaces invalid bytes with U+FFFD. These cases decode as UTF-8:
  - an absent header, no `charset` parameter, or an empty value;
  - a label `TextDecoder` rejects with a `RangeError`, such as `x-unknown`, or `iso-2022-kr`, which the Encoding Standard maps to its unsupported `replacement` encoding.
  Catch only `RangeError` from the constructor. `TextDecoder` resolves label aliases itself (`ISO-8859-1` and `latin1` both decode as `windows-1252`), so no alias table is added. The default `ignoreBOM: false` drops one leading byte-order mark of the encoding in use. The declared charset always wins: there is no BOM sniffing, so a UTF-8 BOM under `charset=windows-1252` decodes as `ï»¿`.
- **Capped body reading (source plan, Response size limit).** `readCappedBody(response, maxBytes)` in a new `src/web/providers/local-body.ts` resolves to the raw bytes as one `Uint8Array`. It works in three stages:
  1. **Declared length.** When the `Content-Length` header consists only of ASCII digits and its value is above `maxBytes`, it cancels the body (`response.body?.cancel()`, awaited) and throws `ProviderRequestError('response larger than 50 MB')` before reading. Any other value, such as `abc`, `1e9`, or a comma-joined duplicate, is ignored, and the streamed count below still applies. A value exactly equal to `maxBytes` passes.
  2. **Streamed count.** It reads `response.body` through `getReader()` and adds each chunk's `byteLength` as it arrives. As soon as the running total exceeds `maxBytes`, it cancels the reader and throws the same error. So an endless body is never buffered whole, and a total exactly equal to `maxBytes` is accepted. The count is of the bytes the reader yields, which `fetch` has already decompressed. A compressed `Content-Length` under the cap therefore can't let an inflated body past it.
  3. **Result.** It concatenates the chunks in order into one `Uint8Array`, for example with `Buffer.concat(chunks, total)`. A `null` body, such as a 204, yields an empty `Uint8Array`.
  Both cancels are awaited, and a rejection from the cancel itself is swallowed, so the cap reason always wins. A stream's `cancel()` rejects when its source's `cancel` throws. Any error from `read()` propagates unchanged and is never wrapped, so subplan 11 can classify a timeout, an abort, or a network error with the same rules as every other attempt. The cap is the exported constant `LOCAL_MAX_BODY_BYTES`, 50 × 1024 × 1024 (52428800) bytes. The reason text is always the literal `response larger than 50 MB`, whatever `maxBytes` is passed. `maxBytes` is a parameter only so tests can use a small cap, and the only production caller (subplan 11) passes `LOCAL_MAX_BODY_BYTES`.
- **Module split.** The pure URL and header rules go in `local-rules.ts`, and the stream reader goes in `local-body.ts`, so each file has one responsibility and both stay well under 200 lines (about 70 and 35). Neither module imports the other, and neither imports anything from `src/web/fetch/` or the registry.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` (today `src/web-search/contract.ts:66`) | The refusals and the cap failure |
| Node standard library | `net.isIP`, `net.BlockList`, `URL`, `TextDecoder`, `ReadableStream` readers, `Buffer.concat` | The whole implementation; no dependency is added |
| Non-fatal decoder precedent | `new TextDecoder().decode(content)` in `src/plugins/remote-capabilities.ts` | The default replacing mode used here; the `fatal: true` decoders in `src/file-read/read.ts` and `src/file-write/` are the wrong model |

Nothing in the repo already classifies IP ranges or parses a response `Content-Type`: `grep -rnE "BlockList|isIP" src` finds nothing, and `servedContentType` in `src/open/content-type.ts` chooses the type of a file being served, not one being read. So `BlockList` and the content-type parsing are new here.

## Proposed changes

- `src/web/providers/local-rules.ts` (new): the module-level `BlockList`, the private `keepsHttp`, and the exported `upgradedUrl`, `acceptedContentType`, and `decodeBody`.
- `src/web/providers/local-body.ts` (new): `LOCAL_MAX_BODY_BYTES` and `readCappedBody`.

## Tests

- `src/web/providers/local-rules.test.ts` (new), exercising the host check through `upgradedUrl`:
  - upgraded: `http://example.com/`, `http://172.32.0.1/`, `http://8.8.8.8/`, `http://[2001:db8::1]/` (the IPv6 single-label trap), and `http://example.com./`;
  - kept `http:`: `http://localhost:3000/`, `http://app.localhost/`, `http://LOCALHOST/`, `http://localhost./`, `http://intranet/`, `http://intranet./`, `http://127.0.0.1/`, `http://2130706433/`, `http://10.1.2.3/`, `http://172.16.0.1/`, `http://172.31.255.255/`, `http://192.168.1.1/`, `http://169.254.169.254/`, `http://[::1]/`, `http://[fd00::1]/`, `http://[fe80::1]/`, and `http://[::ffff:192.168.1.1]/`;
  - `https://localhost/` and `https://example.com/` unchanged; `http://example.com:8080/a?b#c` becomes `https://example.com:8080/a?b#c`; the argument `URL` is not mutated and the result is a different object;
  - content types: `text/html; charset=utf-8`, `TEXT/PLAIN`, ` text/csv ; x=y`, `application/xhtml+xml`, `application/json`, `application/ld+json`, `application/xml`, and `image/svg+xml` accepted, each returning its lowercased media type; `Application/PDF; x=y`, `image/png`, `video/mp4`, `application/octet-stream`, `null`, and an empty string refused with the exact reasons `unsupported content type application/pdf` (and so on), the last two naming `application/octet-stream`;
  - charsets: UTF-8 for a `null` header, for no `charset` parameter, and for an empty one; byte `0xE9` under `charset=ISO-8859-1` decodes as `é`; byte `0x80` under `charset="windows-1252"` decodes as `€` (proving the quotes are stripped); `CHARSET=utf-8` is read case-insensitively; `charset=x-unknown` and `charset=iso-2022-kr` fall back to UTF-8; invalid UTF-8 bytes become U+FFFD; one leading UTF-8 BOM is dropped.
- `src/web/providers/local-body.test.ts` (new), using `new Response(stream, { headers })`. Build every test stream with `{ highWaterMark: 0 }` as its queuing strategy. With the default high-water mark of 1, a `ReadableStream` calls `pull` once as soon as it's constructed, before anything reads, so a "nothing was pulled" assertion would fail. Cases:
  - `LOCAL_MAX_BODY_BYTES` is 52428800;
  - a multi-chunk body under the cap returned whole, chunks in order;
  - a `Content-Length` above the cap refused with `response larger than 50 MB` before any `pull`, with the source's `cancel` called;
  - a `Content-Length` exactly at the cap, and a non-numeric `Content-Length` with a small body, each read normally;
  - a body without `Content-Length` that crosses the cap refused, with the source's `cancel` called and no later chunk pulled (use a test cap of a few bytes through the `maxBytes` parameter);
  - a body exactly at the cap accepted;
  - a source whose `cancel` throws still gives the cap reason;
  - a `null` body yielding an empty `Uint8Array`;
  - a stream error propagating as the same error object.

## Documentation

None here. Subplan 12 documents the `local` provider's rules in `documentation/developer-documentation/web-search-providers.md`, and subplan 21 writes them into `product/specs/web-fetch.md`. Nothing user-visible changes in this plan.

## Out of scope

- The provider module, request headers, timeout and abort handling, and status handling (subplan 11); redirects and the catalog entry (subplan 12).
- Address checks before connecting. There are none by design (source plan, Reachable hosts). The BlockList decides only whether `http:` is kept.
- Converting a body to Markdown or text, and extracting text from a PDF (source plan, Out of scope).

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web/providers/local-rules src/web/providers/local-body` so both new suites run even if `--changed` skips untracked files. No user-visible behavior changes, so there is no manual check yet. A tab can't run a fetch until subplan 21.
