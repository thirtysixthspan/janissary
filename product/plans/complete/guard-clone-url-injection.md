# Guard the clone URL against git option and command-transport injection

**Complexity: 3/10** — one pure validator in `src/git/repository-url.ts`, one guard and a `--` separator in `src/git/clone.ts`, and tests. Every clone already goes through `startGitClone`, and every failure it reports already reaches the `clone-failed` refusal.

## Goal

The remote root clone runs `git clone <url> <target>` with the URL taken from the `provision` frame, which carries the launching project's `origin`. Git reads two dangerous things from that position:

- An argument starting with `-` is an option (`--upload-pack=<cmd>`, `--separate-git-dir=<dir>`, `-c <key>=<value>`), so a crafted origin can make git run a command or write outside the target.
- A `<transport>::<address>` URL invokes a remote helper. `ext::<command>` runs its command on the machine doing the clone, and `fd::` talks over inherited file descriptors. Both are command transports, not repository locations.

A malicious or compromised checkout can rewrite its own `origin`, so launching against it could run the origin author's command under the remote account. `startGitClone` must refuse these shapes before it spawns anything.

## Design decisions

- **Validate in `startGitClone`, not only on the root path.** The root clone, the remote workspace clone, and the local `-w` clone all go through it, so one guard covers every clone. A refused URL rejects `ready` with a clear reason and spawns nothing, so the root clone's refusal flows through the existing `clone-failed` path (`serve-root-offer.ts`), and the local side words it with the line it already has.
- **Refuse exactly two shapes.** One is a URL starting with `-`. The other is a remote-helper URL whose transport is `ext` or `fd`, the helpers that run a command or use inherited descriptors, matched case-insensitively. The review entry also named `ssh:`, but `ssh://` is an ordinary transport that must keep cloning, and there is no `ssh::` command transport. Other `<transport>::` helpers (for example `codecommit::`) are real repository transports and keep working, and git's own `protocol.allow` policy still applies to them.
- **Pass `--` before the URL and target** as well. That makes the option half structurally impossible even if the validator ever missed a shape. It also covers a target path, which is always absolute today.
- **The validator is pure** (`cloneUrlError(url)` returning a reason or `undefined`) and lives beside the other URL helpers. It changes no URL, so every accepted form is passed to git exactly as before.

## Implementation steps

1. `src/git/repository-url.ts`: add `cloneUrlError(url): string | undefined`.
   - For a `-`-leading URL it returns `the URL starts with "-", which git would read as an option`.
   - For an `ext::`/`fd::` URL it returns `the "<transport>::" transport runs a command rather than fetching a repository`.
   - Otherwise it returns `undefined`.
2. `src/git/clone.ts`: in `startGitClone`, check `cloneUrlError(url)` first. If it returns a reason, return a handle whose `ready` rejects with `Refusing to clone <url>: <reason>.` and whose `cancel` is a no-op, spawning nothing. In `cloneCommand`, put `--` between `clone` and the URL in both argument forms.

## Tests

- `src/git/repository-url.test.ts`: `cloneUrlError` returns a reason for `-`-leading URLs (`--upload-pack=touch /tmp/x`, `-oProxyCommand=x:repo`) and for `ext::sh -c touch% /tmp/x`, `EXT::…`, and `fd::3`. It returns `undefined` for the scp, `ssh://`, HTTPS, `file://`, local-path, and `codecommit::` forms.
- `src/git/clone.test.ts`:
  - A dash-leading URL and an `ext::` URL both reject with the refusal reason, and no git process is spawned.
  - An ordinary bare-repository clone still runs, and its arguments now carry `--` before the URL.
  - The token form keeps its credential arguments ahead of `clone` and `--`.
- `src/remote/serve-root-offer.test.ts`: an accepted offer for an `ext::` origin reports `clone-failed` with the refusal reason and creates nothing.
- The existing `src/workspace/index.test.ts` provisioning cases keep passing on the ordinary origin, which pins that the workspace clone's behavior did not move.

## Spec

`product/specs/remote-server.md`, "Missing clone": the host refuses to clone an origin that git would read as an option or as a command transport. The launch then fails with the clone-failed line.

## Out of scope

- Validating the origin on the local side before sending it. The remote is the machine that runs git, so it is the one that must refuse.
- Scrubbing credentials from refusal strings (the next pull-request backlog entry).
- Changing git's `protocol.allow` policy for other remote helpers.
