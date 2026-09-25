# Scrub embedded credentials from root refusals

**Complexity: 2/10** — one pure text helper beside `withoutCredentials`, two call sites on the remote side, and tests.

## Goal

Two root refusals carry strings from the remote host back to the local side, which writes them into the placeholder and the notifications feed:

- The `different-origin` refusal's `other` is the remote repository's `origin`, exactly as `git remote get-url origin` answers it.
- The `clone-failed` refusal's `reason` is git's first stderr line.

Either can embed a credential, for example the `https://<token>@github.com/...` origin form, or a git error quoting that URL. The notifications feed then keeps it long after the ssh channel is gone. The frame should carry these strings with credentials removed, so the local wording (`rootRefusalMessage`) needs no change.

## Design decisions

- **`other` is a URL**, so `withoutCredentials` applies to it directly. That strips an HTTP(S) username and password and an `ssh://` password, and keeps the readable shape. The origin comparison (`sameRepository`) still uses the raw value. Only what is reported is scrubbed.
- **`reason` is a sentence, not a URL.** The review entry proposed `withoutCredentials` for it too, but that parses the whole string as one URL and would pass a sentence through unchanged. A new `withoutCredentialsIn(text)` finds every `scheme://…` token in the text and maps each through `withoutCredentials`, leaving the rest of the sentence alone. The scp form carries no password and needs nothing.

## Implementation steps

1. `src/git/repository-url.ts`: add `withoutCredentialsIn(text)`, which replaces every `<scheme>://<non-space, non-quote run>` with `withoutCredentials` of it.
2. `src/remote/serve-root.ts`: `repositoryRoot` builds the `different-origin` refusal with `other: withoutCredentials(other)`.
3. `src/remote/serve-root-offer.ts`: the `clone-failed` refusal's `reason` is `withoutCredentialsIn(errorText(error))`.

## Tests

- `src/git/repository-url.test.ts`: `withoutCredentialsIn` strips a token from a URL quoted inside git's error sentence, strips several URLs in one line, keeps an `ssh://` login, and leaves text with no credential unchanged.
- `src/remote/serve-root.test.ts`: a different-origin case whose remote origin embeds `user:token@` reports `other` without it.
- `src/remote/serve-root-offer.test.ts`: a failing clone whose URL carries userinfo reports a `clone-failed` reason that does not contain the credential.
- The refusal-wording tests in `src/launch-name/fail-remote.test.ts` keep passing unchanged.

## Spec

`product/specs/remote-server.md`, "Missing clone": the origins and git error text a refusal reports have embedded credentials removed.

## Out of scope

- Scrubbing other remote-sourced text, such as `workspace-failed` messages. That surface is older than this pull request.
